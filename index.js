require("dotenv").config();
const {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  RollbackTransactionCommand,
  CommitTransactionCommand,
} = require("@aws-sdk/client-rds-data");
const fs = require("fs");
const chalk = require("chalk");

const engine = process.env.RDS_RDBMS || "postgres";

const clientParams = {
  apiVersion: "2018-08-01",
  region: process.env.RDS_REGION,
  database: process.env.RDS_DATABASE || engine,
};

const [migrationPath, debug] = process.argv.slice(2);

const rdsDataClient = new RDSDataClient(clientParams);

const params = {
  resourceArn: process.env.RDS_RESOURCE_ARN,
  secretArn: process.env.RDS_SECRET_ARN,
};

const checkMigrationsSchema = async () => {
  debug &&
    console.log(
      chalk(
        chalk.bgYellow("Debug:"),
        `Starting check migrations schema for ${JSON.stringify({
          ...clientParams,
          ...params,
        })}`,
        "\n\n"
      )
    );
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
            ? `CREATE TABLE IF NOT EXISTS MIGRATIONS.version (
              id SERIAL,
              version varchar NULL DEFAULT NULL,
              PRIMARY KEY (id))`
            : `CREATE TABLE IF NOT EXISTS MIGRATIONS.version (
              id INT NOT NULL AUTO_INCREMENT,
              version varchar NULL DEFAULT NULL,
              PRIMARY KEY (id))
              ENGINE = InnoDB`,
      })
    );
  } catch (error) {
    throw new Error(`check migrations schema failed. Error: ${error}`, {
      cause: error,
    });
  }
};

const checkMigrationTable = async () => {
  try {
    // get the current version
    const { records } = await rdsDataClient.send(
      new ExecuteStatementCommand({
        ...params,
        sql: `SELECT version FROM MIGRATIONS.version WHERE id = 1`,
      })
    );
    return records.length ? records[0][0]["stringValue"] : false;
  } catch (error) {
    throw new Error("check migration table failed", { cause: error });
  }
};

const updateSchemaMigrationVersion = async (fileName, transactionId) => {
  await rdsDataClient.send(
    new ExecuteStatementCommand({
      ...params,
      sql:
        engine === "postgres"
          ? `INSERT INTO MIGRATIONS.version (id, version)
              VALUES (1, '${fileName}') ON CONFLICT (id) DO UPDATE SET version = excluded.version;`
          : `INSERT INTO MIGRATIONS.version (id, version)
              VALUES (1, '${fileName}') ON DUPLICATE KEY UPDATE version=VALUES(version);`,
      transactionId,
    })
  );
};

const executeFileStatements = async (fileName) => {
  const filePath = `${process.env.PWD}/${migrationPath}/${fileName}`;
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist ${filePath}`);
  }

  console.log(
    chalk(
      chalk.blue("Info:"),
      `Running Migration`,
      chalk.magenta(fileName),
      "\n\n"
    )
  );
  const contents = fs.readFileSync(filePath, "utf8");
  const statements = contents.split(";");

  const { transactionId } = await rdsDataClient.send(
    new BeginTransactionCommand(params)
  );

  try {
    for (let i = 0; i < statements.length; i++) {
      let sql = statements[i]?.trim();
      if (!sql || sql == "\n") {
        continue;
      }
      console.log(
        chalk(
          chalk.blue("Info:"),
          `Running Migration Statement`,
          chalk.magenta(i + 1),
          "\n",
          sql
        )
      );

      await rdsDataClient.send(
        new ExecuteStatementCommand({
          ...params,
          sql,
          transactionId,
        })
      );

      console.log(
        chalk(
          chalk.green("Success:"),
          `Migration Statement`,
          chalk.magenta(i + 1),
          "\n\n"
        )
      );
    }

    await updateSchemaMigrationVersion(fileName, transactionId);
    await rdsDataClient.send(
      new CommitTransactionCommand({
        ...params,
        transactionId,
      })
    );
    console.log(
      chalk(
        chalk.green("Success:"),
        `Migration Complete`,
        chalk.magenta(fileName)
      )
    );
  } catch (error) {
    await rdsDataClient.send(
      new RollbackTransactionCommand({
        ...params,
        transactionId,
      })
    );
    throw new Error(`Statement in ${fileName} failed. Error: ${error}`, {
      cause: error,
    });
  }
};

const getFileNameTime = (fileName) =>
  BigInt(fileName.split("_")[0].replace(".sql", ""));

const migrate = async (currentMigrationVersion) => {
  const files = fs.readdirSync(`${process.env.PWD}/${migrationPath}`);

  const currentMigrationFileTime = getFileNameTime(currentMigrationVersion);

  const filteredFiles = files
    .filter(
      (file) =>
        !currentMigrationVersion ||
        getFileNameTime(file) > currentMigrationFileTime
    )
    .sort((a, b) =>
      getFileNameTime(a) < getFileNameTime(b)
        ? -1
        : getFileNameTime(a) > getFileNameTime(b)
        ? 1
        : 0
    );

  if (!filteredFiles.length) {
    console.log(
      `${chalk.yellow("Warn:")} Current migration ${chalk.magenta(
        currentMigrationVersion
      )} is up to date`
    );
    return;
  }

  for (const file of filteredFiles) {
    await executeFileStatements(file);
  }
};

const run = async () => {
  try {
    await checkMigrationsSchema();
    const currentMigrationVersion = await checkMigrationTable();
    await migrate(currentMigrationVersion);
  } catch (error) {
    console.log(chalk.red(error));
  }
};

run();
