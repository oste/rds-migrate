#!/usr/bin/env node

import {getConfig} from './getConfig';
import {Migration} from './migration';

async function execute() {
  const STAGE = process.env.STAGE || 'dev';
  const REGION = process.env.MTFX_AWS_REGION || 'eu-west-1';

  require('dotenv').config();

  const dbConfig = await getConfig(STAGE, REGION);

  if (process.argv.length < 3) {
    throw new Error('Missing command line argument with path to SQL folder');
  }

  const sqlFolder = `./${process.argv[2]}`;

  const migration = new Migration(dbConfig, sqlFolder);
  await migration.migrate();
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
