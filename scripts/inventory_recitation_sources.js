#!/usr/bin/env node
/* Read-only inventory of configured recording folders; not a license checker. */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/data.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { timeout: 1000 });
const rows = vm.runInContext('RECITERS.map(({id, n, folder}) => ({id, name: n, folder}))', context);
const output = {
  description: 'Configured folder inventory, not proof of existence, identity or license. Recording rights require individual verification.',
  source: 'public/js/data.js',
  folder_template: 'https://everyayah.com/data/{folder}/{surah:03d}{ayah:03d}.mp3',
  reciters: rows,
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
