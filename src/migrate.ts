#!/usr/bin/env node

import {getConfig} from './getConfig';
import {Migration} from './migration';

async function execute() {
  require('dotenv').config();

  const STAGE = process.env.STAGE || 'dev';
  const REGION = process.env.MTFX_AWS_REGION || 'eu-west-1';
  const TARGET_VERSION = parseInt(process.env.migrate_target_version!) || false;
  const ALLOW_DOWNGRADE = process.env.migrate_allow_downgrade
    ? process.env.migrate_allow_downgrade.toLowerCase() === 'true'
    : false;

  const dbConfig = await getConfig(STAGE, REGION);

  const sqlFolder = `./${process.argv[2] || 'assets/sql'}`;

  const migration = new Migration(dbConfig, sqlFolder);
  await migration.migrate(TARGET_VERSION, ALLOW_DOWNGRADE);
}

(async () => {
  try {
    await execute();
  } catch (error) {
    console.error(
      'Database migration failed, no changes should have been committed'
    );
    console.error(error);
  }
})();
