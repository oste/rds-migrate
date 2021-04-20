#!/usr/bin/env node

import {getConfig} from './getConfig';

const RDS_MIGRATION_VERSION = '0'; //TODO deduce this from list of migration files

(async () => {
  const STAGE = process.env.STAGE || 'dev';
  const REGION = process.env.MTFX_AWS_REGION || 'eu-west-1';

  require('dotenv').config();
  const AWS = require('aws-sdk');

  const RDS = new AWS.RDSDataService({
    apiVersion: '2018-08-01',
    region: process.env.MTFX_AWS_REGION,
  });

  const fs = require('fs');

  const chalk = require('chalk');
  const log = console.log;

  const migrationConfig = await getConfig(STAGE, REGION);

  const params = {
    resourceArn: migrationConfig.resourceArn,
    secretArn: migrationConfig.secretArn,
    database: migrationConfig.database,
    sql: '',
  };

  const engine = migrationConfig.engine || 'postgres';

  const checkMigrationsSchema = async () => {
    try {
      if (engine === 'postgres') {
        params.sql = 'CREATE SCHEMA IF NOT EXISTS MIGRATIONS';
      } else {
        params.sql =
          'CREATE SCHEMA IF NOT EXISTS MIGRATIONS DEFAULT CHARACTER SET utf8';
      }

      await RDS.executeStatement(params).promise();

      if (engine === 'postgres') {
        params.sql = `CREATE TABLE IF NOT EXISTS MIGRATIONS.${process.env.RDS_DATABASE} (
              id SERIAL,
              version INT NULL DEFAULT NULL,
              PRIMARY KEY (id))`;
      } else {
        params.sql = `CREATE TABLE IF NOT EXISTS MIGRATIONS.${process.env.RDS_DATABASE} (
              id INT NOT NULL AUTO_INCREMENT,
              version INT NULL DEFAULT NULL,
              PRIMARY KEY (id))
              ENGINE = InnoDB`;
      }
      await RDS.executeStatement(params).promise();
      return true;
    } catch (error) {
      return Promise.reject(chalk.red(JSON.stringify(error)));
    }
  };

  const checkMigrationTable = async () => {
    try {
      // get the current version
      params.sql = `SELECT version FROM MIGRATIONS.${process.env.RDS_DATABASE} WHERE id = 1`;

      const data = await RDS.executeStatement(params).promise();
      // if we have a version
      if (data.records.length === 1) {
        const currentMigration = parseInt(data.records[0][0]['longValue']);
        const envMigration = parseInt(RDS_MIGRATION_VERSION!);
        if (currentMigration === envMigration) {
          return Promise.reject(
            chalk(
              chalk.yellow('Warn:'),
              'Current migration',
              chalk.magenta(envMigration),
              'is up to date'
            )
          );
        }
        return currentMigration;
        //if it's the first migration start at -1
      } else if (parseInt(RDS_MIGRATION_VERSION!) === 0) {
        return -1;
      }
      return Promise.reject(
        chalk.red(
          'No migration table and migration version is > 0. That is bad.'
        )
      );
    } catch (error) {
      return Promise.reject(chalk.red(JSON.stringify(error)));
    }
  };

  const migrate = async (currentMigration: number) => {
    const executeStatements = async () => {
      const envMigration = parseInt(RDS_MIGRATION_VERSION!);
      while (currentMigration < envMigration) {
        try {
          currentMigration++;

          const filePath = `./${
            process.argv.slice(2)[0]
          }/${currentMigration}.sql`;
          if (!fs.existsSync(filePath)) {
            return Promise.reject(chalk.red(`File does not exist ${filePath}`));
          }

          log(
            chalk(
              chalk.blue('Info:'),
              'Running Migration',
              chalk.magenta(currentMigration)
            )
          );
          const contents = fs.readFileSync(filePath, 'utf8');
          const sql = contents.replace(
            /APP_SCHEMA_ENV/g,
            process.env.RDS_DATABASE
          );

          log(
            chalk(
              chalk.blue('Info:'),
              'Running Migration Statement',
              '\n',
              sql,
              '\n'
            )
          );
          params.sql = sql;
          const data = await RDS.executeStatement(params).promise();
          log(
            chalk(
              chalk.blue('Info:'),
              'Success Migration Statement',
              chalk.magenta(1),
              '\n',
              chalk.gray(JSON.stringify(data)),
              '\n\n'
            )
          );
        } catch (error) {
          return Promise.reject(chalk.red(JSON.stringify(error)));
        }
      }
      return Promise.resolve();
    };

    return executeStatements().then(
      async () => {
        // params.database = process.env.RDS_DATABASE;
        if (engine === 'postgres') {
          params.sql = `INSERT INTO MIGRATIONS.${process.env.RDS_DATABASE} (id, version) VALUES (1, ${currentMigration}) ON CONFLICT (id) DO UPDATE SET version = excluded.version;`;
        } else {
          params.sql = `INSERT INTO MIGRATIONS.${process.env.RDS_DATABASE} (id, version) VALUES (1, ${currentMigration}) ON DUPLICATE KEY UPDATE version=VALUES(version);`;
        }
        const data = await RDS.executeStatement(params).promise();
        log(
          chalk(
            chalk.blue('Info:'),
            'Migration Complete',
            chalk.magenta(currentMigration),
            chalk.gray(JSON.stringify(data))
          )
        );

        return Promise.resolve();
      },
      error => {
        return Promise.reject(chalk.red(error));
      }
    );
  };

  checkMigrationsSchema()
    .then(checkMigrationTable)
    .then(migrate)
    .then(
      () => {
        log(chalk.green('SUCCESS'));
      },
      reject => {
        log(reject);
      }
    );
})();
