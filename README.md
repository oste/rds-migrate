# RDS-Migrate

Migration tool for rds databases

## Getting Started

`npm install rds-migrate`

You will need the following environment variables:

```
RDS_MIGRATION_VERSION=0
RDS_RESOURCE_ARN=Your RDS Cluster ARN
RDS_SECRET_ARN=Your RDS Secret ARN
RDS_DATABASE=Your RDS Database
RDS_SCHEMA=Your RDS Schema
RDS_REGION=Your RDS Region ex. us-east-2
RDS_RDBMS=Default is "mysql". "postgres" also accepted
```

Add to your package.json `scripts` section:

```
"migrate": "rds-migrate src/migrations",
```

Where the argument passed(`src/migrations`) is the location of your migrations directory relative to package.json directory.

### How it works

The script will create a MIGRATIONS schema and a table matching your `RDS_SCHEMA` environment variable. The `RDS_SCHEMA` table will contain the current migration version. Running `rds-migrate` will check the table and run new migrations if needed.

### Prerequisites

- All migration scripts should have numeric filenames starting at 0 and be placed in the directory passed to rds-migrate command. For example `/src/migrations/0.sql`, `/src/migrations/1.sql` etc.

- Before running each statement the `APP_SCHEMA_ENV` placeholder will be replaced by the `RDS_SCHEMA` environment variable. This allows for a dynamic schema.

## Running the tests

TODO

## Contributing

Please contribute and help make this better. You can contribute simply by using the package or by opening an issue or comitting code.

## Authors

- **Mike Osterhout** - _Initial work_ - [Twitter](https://twitter.com/mikeoste)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
