'use strict';
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
test('all simulator browser scripts parse as ES5 (not a vehicle runtime guarantee)', () => {
  for (const name of ['controller.js', 'mock-adapter.js', 'app.js']) {
    acorn.parse(fs.readFileSync(path.join(__dirname, '../simulator', name), 'utf8'), { ecmaVersion: 5 });
  }
});
