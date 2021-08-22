require("dotenv").config();
const {
  RDSDataClient,
  ExecuteStatementCommand,
} = require("@aws-sdk/client-rds-data");
const fs = require("fs");
const chalk = require("chalk");

const rdsDataClient = new RDSDataClient({
  apiVersion: "2018-08-01",
  region: process.env.RDS_REGION,
  database: process.env.RDS_DATABASE,
});

const params = {
  resourceArn: process.env.RDS_RESOURCE_ARN,
  secretArn: process.env.RDS_SECRET_ARN,
};

const engine = process.env.RDS_RDBMS || "mysql";

const checkMigrationsSchema = async () => {
  try {
    await rdsDataClient.send(
      new ExecuteStatementCommand({
        ...params,
        sql:
          engine === "postgres"
            ? `CREATE SCHEMA IF NOT EXISTS MIGRATIONS`
            : `CREATE SCHEMA IF NOT EXISTS MIGRATIONS DEFAULT CHARACTER SET utf8`,
      })
    );

    await rdsDataClient.send(
      new ExecuteStatementCommand({
        ...params,
        sql:
          engine === "postgres"
            ? `CREATE TABLE IF NOT EXISTS MIGRATIONS.${process.env.RDS_SCHEMA} (
              id SERIAL,
              version INT NULL DEFAULT NULL,
              PRIMARY KEY (id))`
            : `CREATE TABLE IF NOT EXISTS MIGRATIONS.${process.env.RDS_SCHEMA} (
              id INT NOT NULL AUTO_INCREMENT,
              version INT NULL DEFAULT NULL,
              PRIMARY KEY (id))
              ENGINE = InnoDB`,
      })
    );
  } catch (error) {
    throw new Error("check migrations schema failed", { cause: error });
  }
};

var checkMigrationTable = async () => {
  try {
    // get the current version
    const { records } = await rdsDataClient.send(
      new ExecuteStatementCommand({
        ...params,
        sql: `SELECT version FROM MIGRATIONS.${process.env.RDS_SCHEMA} WHERE id = 1`,
      })
    );
    // if we have a version
    if (records.length === 1) {
      var currentMigration = parseInt(records[0][0]["longValue"]);
      var envMigration = parseInt(process.env.RDS_MIGRATION_VERSION);
      if (currentMigration === envMigration) {
        return {
          needsMigrations: false,
          message: `${chalk.yellow("Warn:")} Current migration ${chalk.magenta(
            envMigration
          )} is up to date`,
        };
      }
      return {
        needsMigrations: true,
        currentMigration,
      };
      //if it's the first migration start at -1
    } else if (parseInt(process.env.RDS_MIGRATION_VERSION) === 0) {
      return {
        needsMigrations: true,
        currentMigration: -1,
      };
    }
    throw new Error(
      "No migration table and migration version is > 0. That is bad."
    );
  } catch (error) {
    throw new Error("check migration table failed", { cause: error });
  }
};

var migrate = async (currentMigration) => {
  const executeStatements = async () => {
    const envMigration = parseInt(process.env.RDS_MIGRATION_VERSION);
    while (currentMigration < envMigration) {
      currentMigration++;

      var filePath = `${process.env.PWD}/${
        process.argv.slice(2)[0]
      }/${currentMigration}.sql`;
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist ${filePath}`);
      }

      console.log(
        chalk(
          chalk.blue("Info:"),
          `Running Migration`,
          chalk.magenta(currentMigration)
        )
      );
      var contents = fs.readFileSync(filePath, "utf8");
      var contents = contents.replace(
        /APP_SCHEMA_ENV/g,
        process.env.RDS_SCHEMA
      );
      var statements = contents.split(";");
      for (let i = 0; i < statements.length; i++) {
        let sql = statements[i];
        if (!sql || sql == "\n") {
          continue;
        }
        console.log(
          chalk(
            chalk.blue("Info:"),
            `Running Migration Statement`,
            chalk.magenta(i + 1),
            "\n",
            sql,
            "\n"
          )
        );

        const data = await rdsDataClient.send(
          new ExecuteStatementCommand({
            ...params,
            sql,
          })
        );

        console.log(
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
    }
  };

  const updateSchemaMigrationVersion = async () => {
    const data = await rdsDataClient.send(
      new ExecuteStatementCommand({
        ...params,
        sql:
          engine === "postgres"
            ? `INSERT INTO MIGRATIONS.${process.env.RDS_SCHEMA} (id, version)
              VALUES (1, ${currentMigration}) ON CONFLICT (id) DO UPDATE SET version = excluded.version;`
            : `INSERT INTO MIGRATIONS.${process.env.RDS_SCHEMA} (id, version)
              VALUES (1, ${currentMigration}) ON DUPLICATE KEY UPDATE version=VALUES(version);`,
      })
    );
    console.log(
      chalk(
        chalk.blue("Info:"),
        `Migration Complete`,
        chalk.magenta(currentMigration),
        chalk.gray(JSON.stringify(data))
      )
    );
  };

  await executeStatements();
  await updateSchemaMigrationVersion();
};

const run = async () => {
  try {
    await checkMigrationsSchema();
    const { needsMigrations, message, currentMigration } =
      await checkMigrationTable();
    if (!needsMigrations) {
      return console.log(message);
    }
    await migrate(currentMigration);
  } catch (error) {
    console.log(chalk.red(error));
  }
};

run();
