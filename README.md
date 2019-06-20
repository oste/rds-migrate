# RDS-Migrate

Simple migration tool for rds databaes

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

### Prerequisites

* All migration scripts should have numeric filenames starting at 0 and be placed in the directory passed to rds-migrate command. For example `/src/migrations/0.sql`, `/src/migrations/1.sql` etc.

* The first migration(`0.sql`) should contain a `Migration` table with `id` and `version` fields like the seen below

```
-- -----------------------------------------------------
-- Table `APP_SCHEMA_ENV`.`Migration`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `APP_SCHEMA_ENV`.`Migration` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `version` INT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB;
```

* In order to use different database/schema names you can use the `APP_SCHEMA_ENV` placeholder. This will get replaced by your `RDS_DATABASE` environment variable.

## Running the tests

TODO

## Contributing

Please contribute and help make this better. You can contribute simply by using the package or by opening an issue or comitting code.

## Authors

* **Mike Osterhout** - *Initial work* - [Twitter](https://twitter.com/mikeoste)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
