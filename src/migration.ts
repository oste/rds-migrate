import {DbConfig, Script, SqlStatement} from './types';
const AWS = require('aws-sdk');
const fs = require('fs');

const log = console;

export class Migration {
  private client: typeof AWS.RDSDataService;
  private readonly engine: string;
  private readonly sqlFolder: string;
  private commonParams: {
    database: string;
    secretArn: string;
    resourceArn: string;
  };

  constructor(dbConfig: DbConfig, sqlFolder: string) {
    this.engine = dbConfig.engine || 'postgres';
    this.commonParams = {
      resourceArn: dbConfig.resourceArn,
      secretArn: dbConfig.secretArn,
      database: dbConfig.database,
    };
    this.sqlFolder = sqlFolder;
  }

  async migrate() {
    log.info(
      `Running database migrations for DB ${this.commonParams.database}`
    );

    await this.createMigrationsSchema();
    await this.createMigrationsTable();

    const currentVersion = await this.getCurrentVersion();
    const migrationScripts = this.listMigrationScripts();
    const latestVersion = this.getLatestVersion(migrationScripts);

    if (currentVersion === latestVersion) {
      log.info(`Already up to date with version ${latestVersion}, exiting`);
      return;
    }

    log.info(
      `Current version: ${currentVersion >= 0 ? currentVersion : 'none'}`
    );
    log.info(`Latest version: ${latestVersion}`);

    await this.executeMigrationScripts(migrationScripts, currentVersion);
    await this.storeCurrentVersion(latestVersion);

    log.info(
      `SUCCESS: DB ${this.commonParams.database} migrated ${
        currentVersion >= 0 ? `from version ${currentVersion} ` : ''
      }to version ${latestVersion}`
    );
  }

  listMigrationScripts(): Script[] {
    const files = fs.readdirSync(this.sqlFolder);

    const scripts = files.map((filename: string) => ({
      version: parseInt(filename.replace(/(^\d+)(.+$)/i, '$1')), //consider digits at the beginning a version number
      filename: filename,
    }));

    if (!scripts) {
      throw new Error(`No sql scripts found in ${this.sqlFolder}`);
    }

    return scripts.sort((a: Script, b: Script) =>
      a.version > b.version ? 1 : -1
    );
  }

  getLatestVersion(scripts: Script[]) {
    return Math.max(...scripts.map(script => script.version));
  }

  async createMigrationsSchema() {
    try {
      const createSchemaSql = {
        postgres: 'CREATE SCHEMA IF NOT EXISTS MIGRATIONS',
        mysql:
          'CREATE SCHEMA IF NOT EXISTS MIGRATIONS DEFAULT CHARACTER SET utf8',
      } as SqlStatement;

      await this.getClient()
        .executeStatement({
          ...this.commonParams,
          sql: createSchemaSql[this.engine],
        })
        .promise();
    } catch (error) {
      throw new Error(`create migration schema: ${JSON.stringify(error)}`);
    }
  }

  async createMigrationsTable() {
    try {
      const createTableSql = {
        postgres: `
            CREATE TABLE IF NOT EXISTS MIGRATIONS.${this.commonParams.database} 
            (
                id SERIAL,
                version INT NULL DEFAULT NULL,
                PRIMARY KEY (id)
            )`,
        mysql: `
            CREATE TABLE IF NOT EXISTS MIGRATIONS.${this.commonParams.database}
            (
                id      INT NOT NULL AUTO_INCREMENT,
                version INT NULL DEFAULT NULL,
                PRIMARY KEY (id)
            ) ENGINE = InnoDB`,
      } as SqlStatement;

      await this.getClient()
        .executeStatement({
          ...this.commonParams,
          sql: createTableSql[this.engine],
        })
        .promise();
    } catch (error) {
      throw new Error(`create migrations table: ${JSON.stringify(error)}`);
    }
  }

  async getCurrentVersion() {
    try {
      const getVersionSql = `
        SELECT version 
        FROM MIGRATIONS.${this.commonParams.database} 
        WHERE id = 1`;

      const data = await this.getClient()
        .executeStatement({
          ...this.commonParams,
          sql: getVersionSql,
        })
        .promise();

      if (data.records.length === 1) {
        return parseInt(data.records[0][0]['longValue']);
      }

      return -1;
    } catch (error) {
      throw new Error(`get current version: ${JSON.stringify(error)}`);
    }
  }

  async executeMigrationScripts(scripts: Script[], currentVersion: number) {
    scripts = scripts.filter(script => script.version > currentVersion);

    for (const script of scripts) {
      const filePath = `${this.sqlFolder}/${script.filename}`;
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist ${filePath}`);
      }

      try {
        const migrationSql = fs.readFileSync(filePath, 'utf8');
        await this.getClient()
          .executeStatement({
            ...this.commonParams,
            sql: migrationSql,
          })
          .promise();
        log.info(`OK: migrate to version ${script.version}`);
      } catch (error) {
        throw new Error(
          `migrating to version ${currentVersion}: ${JSON.stringify(error)}`
        );
      }
    }
  }

  async storeCurrentVersion(latestVersion: number) {
    const storeVersionSql = {
      postgres: `
        INSERT INTO MIGRATIONS.${this.commonParams.database}
            (id, version) 
        VALUES 
            (1, ${latestVersion}) 
        ON CONFLICT (id) DO UPDATE SET version = excluded.version;`,
      mysql: `
        INSERT INTO MIGRATIONS.${this.commonParams.database} 
            (id, version) 
        VALUES 
               (1, ${latestVersion}) 
        ON DUPLICATE KEY UPDATE version=VALUES(version);`,
    } as SqlStatement;

    await this.getClient()
      .executeStatement({
        ...this.commonParams,
        sql: storeVersionSql[this.engine],
      })
      .promise();
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
