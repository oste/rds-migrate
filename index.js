require("dotenv").config();
const { RDSDataService } = require("@aws-sdk/client-rds-data");
const fs = require("fs");
const chalk = require("chalk");

const RDS = new RDSDataService({
  apiVersion: "2018-08-01",
  region: process.env.RDS_REGION,
  database: process.env.RDS_DATABASE,
});

const log = console.log;

const params = {
  resourceArn: process.env.RDS_RESOURCE_ARN,
  secretArn: process.env.RDS_SECRET_ARN
};

const engine = process.env.RDS_RDBMS || 'mysql';

var checkMigrationsSchema = async () => {
  try {
    if (engine === 'postgres') {
      params.sql = `CREATE SCHEMA IF NOT EXISTS MIGRATIONS`;
    } else {
      params.sql = `CREATE SCHEMA IF NOT EXISTS MIGRATIONS DEFAULT CHARACTER SET utf8`;
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
  } catch (error) {
    return Promise.reject(chalk.red(JSON.stringify(error)));
  }
};

var checkMigrationTable = async () => {
  try {
    // get the current version
    params.sql = `SELECT version FROM MIGRATIONS.${process.env.RDS_DATABASE} WHERE id = 1`;

    let data = await RDS.executeStatement(params).promise();
    // if we have a version
    if (data.records.length === 1) {
      var currentMigration = parseInt(data.records[0][0]["longValue"]);
      var envMigration = parseInt(process.env.RDS_MIGRATION_VERSION);
      if (currentMigration === envMigration) {
        return Promise.reject(
          chalk(
            chalk.yellow("Warn:"),
            `Current migration`,
            chalk.magenta(envMigration),
            `is up to date`
          )
        );
      }
      return currentMigration;
      //if it's the first migration start at -1
    } else if (parseInt(process.env.RDS_MIGRATION_VERSION) === 0) {
      return -1;
    }
    return Promise.reject(
      chalk.red("No migration table and migration version is > 0. That is bad.")
    );
  } catch (error) {
    return Promise.reject(chalk.red(JSON.stringify(error)));
  }
};

var migrate = async currentMigration => {
  var executeStatements = async () => {
    var envMigration = parseInt(process.env.RDS_MIGRATION_VERSION);
    while (currentMigration < envMigration) {
      try {
        currentMigration++;

        var filePath = `${process.env.PWD}/${
          process.argv.slice(2)[0]
        }/${currentMigration}.sql`;
        if (!fs.existsSync(filePath)) {
          return Promise.reject(chalk.red(`File does not exist ${filePath}`));
        }

        log(
          chalk(
            chalk.blue("Info:"),
            `Running Migration`,
            chalk.magenta(currentMigration)
          )
        );
        var contents = fs.readFileSync(filePath, "utf8");
        var statements = contents.split(";");
        for (let i = 0; i < statements.length; i++) {
          let sql = statements[i];
          if (!sql || sql == "\n") {
            continue;
          }
          log(
            chalk(
              chalk.blue("Info:"),
              `Running Migration Statement`,
              chalk.magenta(i + 1),
              "\n",
              sql,
              "\n"
            )
          );
          params.sql = sql;
          let data = await RDS.executeStatement(params).promise();
          log(
            chalk(
              chalk.blue("Info:"),
              `Success Migration Statement`,
              chalk.magenta(i + 1),
              "\n",
              chalk.gray(JSON.stringify(data)),
              "\n\n"
            )
          );
        }
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
      let data = await RDS.executeStatement(params).promise();
      log(
        chalk(
          chalk.blue("Info:"),
          `Migration Complete`,
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
      log(chalk.green("SUCCESS"));
    },
    reject => {
      log(reject);
    }
  );
