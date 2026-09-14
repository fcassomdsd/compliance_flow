#!/usr/bin/env node
//
// Verifies that the README's "API Reference" table matches the REST endpoints
// actually defined in data/flows.json (every "http in" node is an endpoint).
//
// The flow file is the entire service, so the README table is the only
// human-facing surface for the REST API. This script makes sure the two cannot
// drift: it fails when an endpoint exists in flows.json but is missing from the
// README, when the README documents an endpoint that no longer exists, or when
// the README lists the same endpoint twice.
//
// Usage: node scripts/verify-endpoints.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const flowsPath = join(root, 'data', 'flows.json');
const readmePath = join(root, 'README.md');

let flows;
try {
  flows = JSON.parse(readFileSync(flowsPath, 'utf8'));
} catch (error) {
  console.error(`FAIL: data/flows.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const actual = new Set(
  flows
    .filter((n) => n && n.type === 'http in' && typeof n.url === 'string' && typeof n.method === 'string')
    .map((n) => `${n.method.toUpperCase()} ${n.url.trim()}`),
);

const readme = readFileSync(readmePath, 'utf8');

// Restrict to the API Reference section so unrelated tables (env vars, flows)
// can never produce false matches.
const sectionStart = readme.indexOf('## API Reference');
if (sectionStart === -1) {
  console.error('FAIL: no "## API Reference" section found in README.md');
  process.exit(1);
}
const sectionEnd = readme.indexOf('\n---', sectionStart);
const section = sectionEnd === -1 ? readme.slice(sectionStart) : readme.slice(sectionStart, sectionEnd);

// Table rows look like: | `GET` | `/path` | description |
// The path may document a query string (e.g. /inspectors?specialty=<code>);
// the manifest compares paths only, so strip it.
const rowPattern = /^\s*\|\s*`?(GET|POST|PUT|PATCH|DELETE)`?\s*\|\s*`?([^`|]+)`?\s*\|/gmi;

const documented = new Map(); // endpoint -> count (for duplicate detection)
for (const match of section.matchAll(rowPattern)) {
  const method = match[1].toUpperCase();
  const path = match[2].trim().replace(/\?.*$/, '');
  const endpoint = `${method} ${path}`;
  documented.set(endpoint, (documented.get(endpoint) ?? 0) + 1);
}

const problems = [];

for (const endpoint of actual) {
  if (!documented.has(endpoint)) {
    problems.push(`endpoint exists in flows.json but is missing from the README API Reference: ${endpoint}`);
  }
}

for (const [endpoint, count] of documented) {
  if (!actual.has(endpoint)) {
    problems.push(`README documents an endpoint that does not exist in flows.json: ${endpoint}`);
  } else if (count > 1) {
    problems.push(`README documents the same endpoint ${count} times: ${endpoint}`);
  }
}

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} endpoint manifest drift(s):`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error(`\nActual endpoints (${actual.size}):`);
  for (const endpoint of [...actual].sort()) {
    console.error(`  ${endpoint}`);
  }
  process.exit(1);
}

console.log(`OK: README API Reference matches data/flows.json — ${actual.size} endpoints documented`);
