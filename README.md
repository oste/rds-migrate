# RDS-Migrate

Migration tool for rds databases

## Getting Started

`npm install rds-migrate`

The following environment variables are used(some optional):

```
AWS_PROFILE=(optional) profile picked up by aws-sdk
RDS_RESOURCE_ARN=Your RDS Cluster ARN
RDS_SECRET_ARN=Your RDS Secret ARN
RDS_REGION=Your RDS Region ex. us-east-2
RDS_RDBMS=(optional) Default is "postgres". "mysql" also accepted
RDS_DATABASE=(optional)Your RDS Database. Will default to RDS_RDBMS
```

Add to your package.json `scripts` section:

```
"migrate": "rds-migrate src/migrations",
```

Where the argument passed(`src/migrations`) is the location of your migrations directory relative to package.json directory.

### Prerequisites

- All migration scripts should have numeric filenames and be placed in the directory passed to rds-migrate command. For example `/src/migrations/123.sql` or `/src/migrations/456_another_migration.sql` etc. The script will split the filename on underscores and use the first section to determine if new migrations are needed.

### How it works

The script will create a `MIGRATIONS` schema with a single `version` table. Running `rds-migrate` will check the current version and run migrations if needed. For example, if the previous migration file that ran was `123_init.sql` the `version` column in the `MIGRATIONS.version` table will be `123_init.sql`. Subsequent `rds-migrate` runs will check for files with a number greater than `123` and run those in order. So if files `345_next.sql` and `678_another.sql` are added both of those will run and the new version stored will be `678_another.sql`.

## Running the tests

TODO

## Contributing

Please contribute and help make this better. You can contribute simply by using the package or by opening an issue or comitting code.

## Authors

- **Mike Osterhout** - _Initial work_ - [Twitter](https://twitter.com/mikeoste)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
