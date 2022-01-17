import * as util from 'util';
import {Script, ScriptDiff, SqlStatement, StatementParameters} from './types';
const fs = require('fs');

const SQL_PATH = process.env.SQL_PATH || './assets/sql/';

export class History {
  private storedHistory = [] as Script[];
  private readonly execute: (
    sqlStatement: SqlStatement | string,
    parameters?: StatementParameters
  ) => Promise<{records: any}>;

  private currentLegacyVersion: number | false = false;
  private readonly sqlFolder: string;

  public constructor(
    execute: (
      sqlStatement: SqlStatement | string,
      parameters?: StatementParameters
    ) => Promise<{records: any[]}>,
    currentLegacyVersion: number | false = false,
    sqlFolder: string
  ) {
    this.execute = execute;
    this.currentLegacyVersion = currentLegacyVersion;
    this.sqlFolder = sqlFolder;
  }

  private async storeLegacyHistory(
    currentLegacyVersion: number | false = false,
    scripts: Script[]
  ) {
    if (currentLegacyVersion === false) {
      return;
    }

    for (const script1 of scripts.filter(
      script => script.version <= currentLegacyVersion
    )) {
      await this.storeVersion(script1, false);
    }

    console.log('Legacy history stored in the new format');
  }

  public async migrate(
    targetVersion: number | false = false,
    legacyCurrentVersion: number | false = false,
    allowDowngrade: boolean = false
  ) {
    const migrationScripts = this.listMigrationScripts() as Script[];
    await this.storeLegacyHistory(legacyCurrentVersion, migrationScripts);

    this.storedHistory = await this.loadHistory();

    if (!targetVersion) {
      targetVersion = [...migrationScripts].reverse()[0].version || -1;
    }

    const historyDiff = History.getHistoryDiff(
      this.storedHistory,
      migrationScripts,
      targetVersion
    );

    console.log('History diff calculated', {diff: JSON.stringify(historyDiff)});

    await this.executeDiff(historyDiff, allowDowngrade);
    return targetVersion;
  }

  private async executeDiff(diff: ScriptDiff, allowDowngrade: boolean = false) {
    if (allowDowngrade) {
      for (const script of diff.downgrade) {
        await this.executeVersion(script, true);
      }
    } else if (diff.downgrade.length) {
      console.log(
        `Skipping downgrade of some scripts as downgrade is disabled (migrate_allow_downgrade env var): ${diff.downgrade.map(
          (script: Script) => script.version
        )}`
      );
    }

    if (!diff.upgrade.length) {
      console.log('Nothing to upgrade');
      return;
    }

    for (const script of diff.upgrade) {
      await this.executeVersion(script, false);
    }
  }

  private async executeVersion(script: Script, downgrade: boolean = false) {
    if (downgrade) {
      if (!script.downgradeSqlCode || !script.downgradeSqlCode.length) {
        console.warn(
          `No downgrade code stored for version ${script.version}, skipping this downgrade`
        );
      } else {
        try {
          await this.execute(script.downgradeSqlCode!);
          await this.removeVersion(script.id);
        } catch (e: any) {
          console.error(
            `Error: migrating version ${script.version} DOWN: ${util.inspect(
              e
            )}`
          );

          throw e;
        }

        console.log(`Migrated DOWN: ${script.version}`);
      }
    } else {
      if (!script.sqlCode) {
        console.warn(
          `No code found for version ${script.version}, skipping this upgrade`
        );
      }

      try {
        await this.execute(script.sqlCode);
        await this.storeVersion(script);
      } catch (e: any) {
        console.error(
          `Error: migrating version ${script.version} UP: ${util.inspect(e)}`
        );

        throw e;
      }

      console.log(`Migrated UP: ${script.version}`);
    }
  }

  private async storeVersion(script: Script, storeTime: boolean = true) {
    const parameters = {
      sqlCode: script.sqlCode,
    } as StatementParameters;

    if (script.downgradeSqlCode) {
      parameters['downgradeSqlCode'] = script.downgradeSqlCode;
    }

    await this.execute(
      `
        INSERT INTO MIGRATIONS.history
            (name, version, sql_code,downgrade_sql_code${
              storeTime ? '' : ', executed' //DEFAULT is CURRENT_TIME
            })
            VALUES ('${script.filename}','${script.version}',:sqlCode,${
        script.downgradeSqlCode ? ':downgradeSqlCode' : 'NULL'
      }${storeTime ? '' : ', NULL'})`,
      parameters
    );
  }

  private async removeVersion(id: number) {
    await this.execute(`
        DELETE FROM MIGRATIONS.history WHERE id = ${id};`);
  }

  private static getHistoryDiff(
    storedHistory: Script[],
    fileHistory: Script[],
    targetVersion: number
  ): ScriptDiff {
    console.log(storedHistory);
    console.log(fileHistory);
    const unexecutedMigrations = fileHistory.filter(
      fileScript =>
        !storedHistory.some(dbScript => History.isSame(fileScript, dbScript))
    );

    const executedMigrationsToDowngrade = storedHistory.filter(
      dbScript =>
        !fileHistory.some(fileScript => History.isSame(fileScript, dbScript)) ||
        dbScript.version > targetVersion
    );

    return {
      upgrade: unexecutedMigrations.filter(
        (script: Script) => script.version <= targetVersion
      ),
      downgrade: executedMigrationsToDowngrade.reverse(),
    };
  }

  private static isSame(fileScript: Script, dbScript: Script) {
    console.log(
      'COMPARE',
      fileScript.version,
      typeof fileScript.version,
      dbScript.version,
      typeof dbScript.version
    );
    if (fileScript.version !== dbScript.version) {
      return false;
    }

    if (fileScript.sqlCode !== dbScript.sqlCode) {
      console.warn(
        `Previously executed SQL code of version ${fileScript.filename} does not match the code in file`,
        {
          fileScript,
          dbScript,
        }
      );
    }

    console.log('is the same');

    return true;
  }

  private async loadHistory() {
    const historySelect = await this.execute(`
        SELECT id, version, name, sql_code, downgrade_sql_code
        FROM migrations.history
        WHERE 1 = 1
        ORDER BY id ASC;
        ;`);

    if (!historySelect.records.length) {
      return [];
    }

    console.log(JSON.stringify(historySelect));
    return historySelect.records.map((record: any) => ({
      id: record[0].longValue,
      version: parseInt(record[1].stringValue),
      filename: record[2].stringValue,
      sqlCode: record[3].stringValue,
      downgradeSqlCode: record[4].isNull ? null : record[4].stringValue,
    }));
  }

  private listMigrationScripts(): Script[] {
    const files = fs.readdirSync(this.sqlFolder);

    const scripts = files.map((filename: string) => ({
      version: parseInt(filename.replace(/(^\d+)(.+$)/i, '$1')), //consider digits at the beginning a version number
      filename: filename,
      sqlCode: fs.readFileSync(`${this.sqlFolder}/${filename}`, 'utf8'),
    }));

    scripts.sort((a: Script, b: Script) => (a.version > b.version ? 1 : -1));

    const pairedScripts = scripts.filter(
      (script: Script) => !script.filename.endsWith('_down.sql')
    );

    scripts
      .filter((script: Script) => script.filename.endsWith('_down.sql'))
      .forEach((downgradeScript: Script) => {
        for (let i = 0; i < pairedScripts.length; i++) {
          if (pairedScripts[i].version === downgradeScript.version) {
            pairedScripts[i].downgradeSqlCode = downgradeScript.sqlCode;
            return;
          }
        }

        console.warn(
          `Downgrade script ${downgradeScript.filename} has no upgrade script match, ignoring`
        );
      });

    return pairedScripts;
  }

  public static async createVersionFile(sqlPath = SQL_PATH) {
    if (!this.fileExists(sqlPath)) {
      console.log(`Location ${sqlPath} doesn't exist, attempting to create it`);
      fs.mkdirSync(sqlPath);
      console.log(
        `Folder ${sqlPath} created, move any existing sql migration scripts into this folder`
      );
    }

    const timestamp = Date.now().toString();

    fs.closeSync(fs.openSync(`${sqlPath}/${timestamp}.sql`, 'w'));
    fs.closeSync(fs.openSync(`${sqlPath}/${timestamp}_down.sql`, 'w'));

    console.log(`Empty file ${sqlPath}/${timestamp}.sql created`);
    console.log(`Empty file ${sqlPath}/${timestamp}_down.sql created`);
  }

  private static fileExists(path: string): boolean {
    try {
      return fs.existsSync(path);
    } catch (error) {
      console.error(`Error when accessing file ${path}`, util.inspect(error));
      throw error;
    }
  }
}
