const dotenv = require('dotenv');
const AWS = require('aws-sdk')
const RDS = new AWS.RDSDataService({ apiVersion: '2018-08-01', region: 'us-east-1' });

const fs = require('fs');

const chalk = require('chalk');
const log = console.log;

dotenv.config();

var params = {
    resourceArn: process.env.RDS_RESOURCE_ARN,
    secretArn: process.env.RDS_SECRET_ARN
};

var checkMigrationTable = async () => {
    try {
        params.sql = `SELECT *
                    FROM information_schema.tables
                    WHERE table_schema = '${process.env.RDS_DATABASE}'
                        AND table_name = 'Migration'
                    LIMIT 1;`
        let data = await RDS.executeStatement(params).promise();

        // as long as the migration table exists lets see where things stand
        if (data.records.length === 1) {
            params.sql = `SELECT version FROM ${process.env.RDS_DATABASE}.Migration WHERE id = 1`;

            let data = await RDS.executeStatement(params).promise();
            var currentMigration = parseInt(data.records[0][0]['longValue']);
            var envMigration = parseInt(process.env.RDS_MIGRATION_VERSION);
            if (currentMigration === envMigration) {
                return Promise.reject(chalk(chalk.yellow('Warn:'), `Current migration`, chalk.magenta(envMigration), `is up to date`));
            }
            return currentMigration;
            //if it's the first migration start at -1
        } else if (parseInt(process.env.RDS_MIGRATION_VERSION) === 0) {
            return -1;
        }
        return Promise.reject(chalk.red('No migration table and migration version is > 0. That is bad.'));
    } catch (error) {
        return Promise.reject(chalk.red(JSON.stringify(error)));
    }
}

var migrate = async (currentMigration) => {

    var executeStatements = async () => {
        var envMigration = parseInt(process.env.RDS_MIGRATION_VERSION);
        while (currentMigration < envMigration) {
            try {
                currentMigration++;

                var filePath = `${process.env.PWD}/${process.argv.slice(2)[0]}/${currentMigration}.sql`;
                if (!fs.existsSync(filePath)) {
                    return Promise.reject(chalk.red(`File does not exist ${filePath}`));
                }

                log(chalk(chalk.blue('Info:'), `Running Migration`, chalk.magenta(currentMigration)));
                var contents = fs.readFileSync(filePath, 'utf8');
                var contents = contents.replace(/APP_SCHEMA_ENV/g, process.env.RDS_DATABASE);
                var statements = contents.split(';');
                for (let i = 0; i < statements.length; i++) {
                    let sql = statements[i];
                    if (!sql || sql == "\n") {
                        continue;
                    }
                    log(chalk(chalk.blue('Info:'), `Running Migration Statement`, chalk.magenta(i + 1), '\n', sql, '\n'));
                    params.sql = sql;
                    let data = await RDS.executeStatement(params).promise();
                    log(chalk(chalk.blue('Info:'), `Success Migration Statement`, chalk.magenta(i + 1), '\n', chalk.gray(JSON.stringify(data)), '\n\n'));
                }
            } catch (error) {
                return Promise.reject(chalk.red(JSON.stringify(error)));
            }
        }
        return Promise.resolve();
    }

    return executeStatements().then(async () => {
        // params.database = process.env.RDS_DATABASE;
        params.sql = `INSERT INTO ${process.env.RDS_DATABASE}.Migration (id, version) VALUES (1, ${currentMigration}) ON DUPLICATE KEY UPDATE version=VALUES(version);`;
        let data = await RDS.executeStatement(params).promise();
        log(chalk(chalk.blue('Info:'), `Migration Complete`, chalk.magenta(currentMigration), chalk.gray(JSON.stringify(data))));

        return Promise.resolve();
    }, (error) => {
        return Promise.reject(chalk.red(error));
    });
}

checkMigrationTable().then(migrate).then(() => {
    log(chalk.green('SUCCESS'));
}, (reject) => {
    log(reject);
});