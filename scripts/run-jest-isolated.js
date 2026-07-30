'use strict';

/**
 * Run each server test file in a fresh Jest process.
 *
 * The legacy suites replace @prisma/client with different stateful factories
 * and import the singleton Express app. A single in-band Jest runtime can
 * therefore retain incompatible module state between suites. Process-level
 * isolation keeps `npm test` deterministic while still running every suite in
 * one command.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const testsRoot = path.join(projectRoot, 'tests');
const jestBin = require.resolve('jest/bin/jest');

function findTests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTests(target);
      return entry.isFile() && entry.name.endsWith('.test.js') ? [target] : [];
    })
    .sort();
}

const rawArgs = process.argv.slice(2);
const requestedFiles = new Set(
  rawArgs
    .filter((arg) => arg.endsWith('.test.js'))
    .map((arg) => path.resolve(projectRoot, arg))
);
const forwardedArgs = rawArgs.filter(
  (arg) => !arg.endsWith('.test.js') && !['--runInBand', '--forceExit'].includes(arg)
);
const allTests = findTests(testsRoot);
const tests = requestedFiles.size
  ? allTests.filter((file) => requestedFiles.has(path.resolve(file)))
  : allTests;

if (tests.length === 0) {
  console.error('No matching Jest test files found.');
  process.exit(1);
}

let failures = 0;
for (const testFile of tests) {
  const relative = path.relative(projectRoot, testFile);
  console.log(`\n[isolated-jest] ${relative}`);
  const result = spawnSync(
    process.execPath,
    [jestBin, '--runInBand', '--forceExit', '--runTestsByPath', testFile, ...forwardedArgs],
    { cwd: projectRoot, env: process.env, stdio: 'inherit' }
  );
  if (result.error) {
    console.error(`[isolated-jest] Could not run ${relative}: ${result.error.message}`);
    failures += 1;
  } else if (result.status !== 0) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n[isolated-jest] ${failures}/${tests.length} suite(s) failed.`);
  process.exit(1);
}

console.log(`\n[isolated-jest] ${tests.length} suite(s) passed.`);
