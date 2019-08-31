# RDS-Migrate

Migration tool for rds databases

## Getting Started

`npm install rds-migrate`

You will need the following environment variables:

```
RDS_MIGRATION_VERSION=0
RDS_RESOURCE_ARN=YOUR RDS Cluster ARN
RDS_SECRET_ARN=YOUR RDS SECRET ARN
RDS_DATABASE=YOUR RDS Database/Schema name
```

Add to your package.json `scripts` section:

```
"migrate": "rds-migrate src/migrations",
```

Where the argument passed(`src/migrations`) is the location of your migrations directory relative to package.json directory.

### How it works

The script will create a MIGRATIONS schema and a table matching your `RDS_DATABASE` config in your database. The `RDS_DATABASE` table will contain the current migration version. Running `rds-migrate` will check the table and run new migrations if needed.

### Prerequisites

* All migration scripts should have numeric filenames starting at 0 and be placed in the directory passed to rds-migrate command. For example `/src/migrations/0.sql`, `/src/migrations/1.sql` etc.

* In order to use different database/schema names you can use the `APP_SCHEMA_ENV` placeholder. This will get replaced by your `RDS_DATABASE` environment variable.

## Running the tests

TODO

## Contributing

Please contribute and help make this better. You can contribute simply by using the package or by opening an issue or comitting code.

## Authors

* **Mike Osterhout** - *Initial work* - [Twitter](https://twitter.com/mikeoste)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
