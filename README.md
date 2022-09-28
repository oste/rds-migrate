# RDS-Migrate

Migration tool for AWS RDS databases, allows downgrade

## Prerequisites
All your migration SQL scripts need to sit directly under a folder (ideally `assets/sql`) prefixed with a numeric version number, e.g.
For adding new versions, use the `rds-new-version` command from the root of your repository, it will create two new files with a timestamp name, one will have the _down suffix and to allow migrating down, a script reverting the changes in the main file needs to be added in it.
Using the command to autogenerate version number prevents conflicts of same numbers between different branches.

```typescript
assets/
  sql/
    1633421853133_firstScript.sql
    1633421853133_firstScript_down.sql
    1633421853458_secondScript.sql
    1633421853458_secondcript_down.sql
```

## Limitation
Do not modify scripts already deployed to DEV or further with this package. Once a script with given number has been run against an environment, it will always be skipped even if it has been changed, therefore, please add new script instead.

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

Add a new migration script by running:
```bash
rds-new-version
```

If the location of your sql scripts is other than `assets/sql`, add your path as the first argument.

## Deploying with Octopus
The only environment variable needed is `deploy.stack_name` with the name of the stack without standard prefixes/postfixes, e.g. for `stage-bankAccounts-stack-euw1` it would be:

```
deploy.stack_name : bankAccounts
```

To allow downgrades, `deploy.migrate_allow_downgrade` must be set to `true` (to prevent downgrades by accidents in prod).
DB backup prior to running this package in prod is mandatory.

Octopus pipeline are set to look for the `rds-new-version`

## How it works
The CDK helper `configureMigration` stores DB cluster and its secret ARN into SSM. When running `rds-migrate` this config is being used to connect to the cluster.

The `rds-migrate` script creates a MIGRATIONS schema with `history` and `log` tables. The former is used to store all scripts that were already executed, as well as their downgrade counterparts. When downgrading, those are removed. Table log is write-only.
When the migration detects scripts that are in the history table but not in current branch, it attempts to downgrade them first, before running the new ones. Those without downgrade scripts stored are skipped.

All sql statements are executed within a single transaction that is only commited if no errors occur.

## Migrating from version 2.x
Migration is automatic, migrations schema changes accordingly and scripts previously run are stored into the history table.

## Running migrations from local machine
Beside `STACK_NAME`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables must be set to contain valid credentials of a user belonging to `dev-rdsMigrate-iamGroup-euw1` IAM group. `.env` file is supported.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
