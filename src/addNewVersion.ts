#!/usr/bin/env node

import {History} from './history';

async function execute() {
  require('dotenv').config();

  const sqlFolder = `./${process.argv[2] || 'assets/sql'}`;

  await History.createVersionFile(sqlFolder);
}

(async () => {
  try {
    await execute();
  } catch (error) {
    console.error('Creating new files failed');
    console.error(error);
  }
})();
