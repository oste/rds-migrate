# RDS-Migrate

Migration tool for AWS RDS databases

## Prerequisites
All your migration SQL scripts need to sit directly under a folder (ideally `assets/sql`) prefixed with a numeric version number, e.g.:
```typescript
assets/
  sql/
    01_initialDbStructure.sql
    02_someAdditionalChanges.sql
```
Initial digits are used for numeric ordering, zeros at the beginning and underscores are for readability purposes only.

## Getting Started

Install the package:
```bash
npm install @milltechfx/rds-migrate
```
Integrate with your CDK stack:
```typescript
import {configureMigration} from '@milltechfx/rds-migrate';
//**
configureMigration(this, yourRdsServerlessCluster);
```
Add `migrate` npm script to your `package.json`pointing to directory with your SQL scripts:
```typescript
"migrate": "rds-migrate assets/sql"
```

## Deploying with Octopus
The only environment variable needed is `deploy.stack_name` with the name of the stack without standard prefixes/postfixes, e.g. for `stage-bankAccounts-stack-euw1` it would be:

```
deploy.stack_name : bankAccounts
```

After clicking on the `deploy` button on a release page, the `Include database migration? Selecting true will execute 'npm run migrate` needs to be set to `True` otherwise migration will be skipped.

## How it works
The CDK helper `configureMigration` stores DB cluster and its secret ARN into SSM. When running `rds-migrate` this config is being used to connect to the cluster.

The `rds-migrate` script creates a MIGRATIONS schema, and a table matching your DB's name where the current migration version will be stored. All .sql files in target folder are listed, ordered and executed. Versions older than previously stored version are skipped.
All sql statements are executed within a single transaction that is only commited if no errors occur.

## Running migrations from local machine
Beside `STACK_NAME`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables must be set to contain valid credentials of a user belonging to `dev-rdsMigrate-iamGroup-euw1` IAM group. `.env` file is supported.


## TODO
* Unit tests
* Store the whole migration history and compare it to migrations folder before continuing
* Backup strategy
* STACK_NAME sanity check with octopus

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
