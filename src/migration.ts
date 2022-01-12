import {DbConfig, SqlStatement, StatementParameters} from './types';
import {History} from './history';
const AWS = require('aws-sdk');
const fs = require('fs');

const log = console;

export class Migration {
  private client: typeof AWS.RDSDataService;
  private readonly engine: string;
  private readonly sqlFolder: string;
  private rdsParams: {
    database: string;
    secretArn: string;
    resourceArn: string;
  };
  private transactionId?: string;
  private history: History | undefined;

  constructor(dbConfig: DbConfig, sqlFolder: string) {
    this.engine = dbConfig.engine || 'postgres';
    this.rdsParams = {
      resourceArn: dbConfig.resourceArn,
      secretArn: dbConfig.secretArn,
      database: dbConfig.database,
    };
    this.sqlFolder = sqlFolder;
  }

  async migrate(targetVersion: number | false = false, allowDowngrade = false) {
    log.info(`Running database migrations for DB ${this.rdsParams.database}`);

    await this.beginTransaction();

    const currentLegacyVersion = await this.getCurrentLegacyVersion();
    if (currentLegacyVersion !== false) {
      log.info(
        `Legacy migration table found with version ${currentLegacyVersion}`
      );
      await this.executeInTransaction(
        `DROP TABLE migrations.${this.rdsParams.database.toLowerCase()}`,
        {},
        true
      );

      log.info('Deleted legacy migrations table structure');
    }

    await this.createMigrationsSchema();
    await this.createMigrationsTable();

    this.history = new History(
      (sqlStatement: SqlStatement | string, parameters?: StatementParameters) =>
        this.executeInTransaction(sqlStatement, parameters),
      currentLegacyVersion,
      this.sqlFolder
    );

    const resultVersion = await this.history.migrate(
      targetVersion,
      currentLegacyVersion,
      allowDowngrade
    );
    await this.commitTransaction();

    log.info(`Done, latest version: ${resultVersion}`);
  }

  async beginTransaction() {
    const transaction = await this.getClient()
      .beginTransaction(this.rdsParams)
      .promise();

    this.transactionId = transaction.transactionId;
  }

  async commitTransaction() {
    const transaction = await this.getClient()
      .commitTransaction({
        secretArn: this.rdsParams.secretArn,
        resourceArn: this.rdsParams.resourceArn,
        transactionId: this.transactionId,
      })
      .promise();

    this.transactionId = transaction.transactionId;
  }

  async createMigrationsSchema() {
    try {
      const createSchemaSql = {
        postgres: 'CREATE SCHEMA IF NOT EXISTS MIGRATIONS',
        mysql:
          'CREATE SCHEMA IF NOT EXISTS MIGRATIONS DEFAULT CHARACTER SET utf8',
      } as SqlStatement;

      await this.executeInTransaction(createSchemaSql, {}, true);
    } catch (error) {
      throw new Error(`create migration schema: ${JSON.stringify(error)}`);
    }
  }

  async createMigrationsTable() {
    try {
      const createTableSql = {
        postgres: `
            CREATE TABLE IF NOT EXISTS migrations.history
            (
                id SERIAL,
                name VARCHAR NULL DEFAULT NULL,
                version NUMERIC,
                executed TIMESTAMPTZ DEFAULT current_timestamp NULL,
                sql_code TEXT,
                downgrade_sql_code TEXT DEFAULT NULL,
                PRIMARY KEY (id)
            );
            CREATE TABLE IF NOT EXISTS migrations.log
            (
                id SERIAL,
                executed TIMESTAMPTZ DEFAULT current_timestamp NULL,
                sql_code TEXT,
                PRIMARY KEY (id)
            );
            `,
        mysql: `
            CREATE TABLE IF NOT EXISTS migrations.history
            (
                id INT NOT NULL AUTO_INCREMENT,
                executed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sql_code TEXT,
                PRIMARY KEY (id)
            ) ENGINE = InnoDB;
            CREATE TABLE IF NOT EXISTS migrations.log
            (
                id INT NOT NULL AUTO_INCREMENT,
                executed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sql_code TEXT,
                PRIMARY KEY (id)
            );
            `,
      } as SqlStatement;

      await this.executeInTransaction(createTableSql, {}, true);
    } catch (error) {
      throw new Error(`create migrations table: ${JSON.stringify(error)}`);
    }
  }

  async getCurrentLegacyVersion() {
    try {
      const oldStructureResult = await this.executeInTransaction(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE 
                table_name='${this.rdsParams.database.toLowerCase()}' 
                AND column_name='version' 
                AND table_schema='migrations';
          ;`,
        {},
        true
      );

      if (!oldStructureResult.records.length) {
        return false;
      }

      const getVersionSql = `
        SELECT version
        FROM MIGRATIONS.${this.rdsParams.database}
        WHERE id = 1`;

      const data = await this.executeInTransaction(getVersionSql, {}, true);

      if (data.records.length === 1) {
        return parseInt(data.records[0][0]['longValue']);
      }

      return false;
    } catch (error) {
      throw new Error(`get current version: ${JSON.stringify(error)}`);
    }
  }

  async executeInTransaction(
    sqlStatement: SqlStatement | string,
    parameters: StatementParameters = {},
    skipWritingLog: boolean = false
  ): Promise<{records: any}> {
    const client = this.getClient();
    const statement =
      typeof sqlStatement === 'string'
        ? sqlStatement
        : sqlStatement[this.engine];

    const formattedParameters = Object.keys(parameters).map(key => ({
      name: key,
      value: {
        stringValue: parameters[key],
      },
    }));

    const result = await client
      .executeStatement({
        ...this.rdsParams,
        sql: statement,
        transactionId: this.transactionId,
        parameters: formattedParameters,
      })
      .promise();

    if (!skipWritingLog) {
      await client
        .executeStatement({
          ...this.rdsParams,
          sql: `INSERT INTO MIGRATIONS.log
            (sql_code)
            VALUES (:sqlCode)`,
          parameters: [
            {
              name: 'sqlCode',
              value: {
                stringValue: statement,
              },
            },
          ],
          transactionId: this.transactionId,
        })
        .promise();
    }

    return result;
  }

  getClient() {
    if (this.client) {
      return this.client;
    }

    this.client = new AWS.RDSDataService({
      apiVersion: '2018-08-01',
      region: process.env.MTFX_AWS_REGION,
    });

    return this.client;
  }
}
