#!/usr/bin/env node
//
// Unit checks for the JavaScript embedded in flows.json's function nodes.
//
// The flow file is the service, and until now none of its logic could be tested
// without a running stack. These functions are pure (msg in, msg/state out) so
// they can be evaluated here with stubbed `env` and `node`, which means CI can
// cover the error envelope, the deployment env plumbing and the retry policy.
//
// Usage: node scripts/verify-flow-logic.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const flows = JSON.parse(readFileSync(join(here, '..', 'data', 'flows.json'), 'utf8'));
const byName = new Map();
for (const node of flows) {
  if (node && node.type === 'function' && node.name) {
    if (!byName.has(node.name)) byName.set(node.name, []);
    byName.get(node.name).push(node);
  }
}

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Evaluate a function node's code with stubbed env/node helpers.
function run(node, msg, envValues = {}) {
  const errors = [];
  const warns = [];
  const env = { get: (key) => envValues[key] };
  const nodeApi = { error: (m) => errors.push(String(m)), warn: (m) => warns.push(String(m)) };
  const fn = new Function('msg', 'env', 'node', node.func);
  const out = fn(msg, env, nodeApi);
  return { out, errors, warns };
}

function firstNodeNamed(name) {
  const list = byName.get(name);
  if (!list || list.length === 0) {
    throw new Error(`no function node named "${name}" in data/flows.json`);
  }
  return list[0];
}

// --- set env config ---------------------------------------------------------
const envConfig = firstNodeNamed('set env config');

{
  const { out } = run(envConfig, {});
  check('env config: defaults applied',
    out.atrocoreBaseUrl === 'http://atro-web/api/v1' && out.alfrescoBaseUrl === 'http://proxy:8080/alfresco',
    JSON.stringify(out));
  check('env config: timeout left to the node default when unset', out.requestTimeout === undefined);
}

{
  const { out } = run(envConfig, {}, {
    ATROCORE_BASE_URL: 'http://atro.example/api/v1',
    ALFRESCO_BASE_URL: 'http://alfresco.example/alfresco',
    HTTP_REQUEST_TIMEOUT_MS: '20000',
  });
  check('env config: env overrides win',
    out.atrocoreBaseUrl === 'http://atro.example/api/v1' &&
    out.alfrescoBaseUrl === 'http://alfresco.example/alfresco' &&
    out.requestTimeout === 20000,
    JSON.stringify(out));
}

{
  const { out } = run(envConfig, {}, { HTTP_REQUEST_TIMEOUT_MS: '' });
  check('env config: empty timeout is ignored', out.requestTimeout === undefined);
}

// --- error envelope ---------------------------------------------------------
const envelope = firstNodeNamed('error envelope');

for (const [label, msg, expected] of [
  ['Error object', { error: new Error('boom') }, 'boom'],
  ['string error', { error: 'plain failure' }, 'plain failure'],
  ['payload fallback', { payload: 'raw upstream text' }, 'raw upstream text'],
  ['nothing to report', {}, 'Request failed'],
]) {
  const { out } = run(envelope, { ...msg });
  check(`error envelope: ${label}`,
    out.payload && out.payload.success === false && out.payload.error === expected,
    JSON.stringify(out.payload));
}

// --- check upstream status: retrying variant (the 5 shared subflow calls) ----
const retrying = ['p21chk-6f319e5a075c3efc', 'p21chk-aa61590209297976', 'p21chk-8644c145ead9a057',
  'p21chk-04a6d3170f653951', 'p21chk-6f9d06e081f9a39e']
  .map((id) => flows.find((n) => n.id === id))
  .filter(Boolean);
check('retry policy: five shared subflow checks carry two outputs', retrying.length === 5 && retrying.every((n) => n.outputs === 2));

for (const node of retrying) {
  const id = node.id;
  const attemptsKey = `retry_${id.replace(/^p21chk-/, '')}`;

  const ok = run(node, { statusCode: 200, payload: { total: 1 } });
  check(`retry policy ${id}: 2xx passes through`, !Array.isArray(ok.out) && ok.out !== null && ok.errors.length === 0);

  const noChange = run(node, { statusCode: 304, payload: '{}' });
  check(`retry policy ${id}: 304 passes through`, !Array.isArray(noChange.out) && noChange.out !== null && noChange.errors.length === 0);

  const client = run(node, { statusCode: 404, payload: 'Controller not found' });
  check(`retry policy ${id}: 4xx errors without retrying`,
    client.out === null && client.errors.length === 1 && /HTTP 404/.test(client.errors[0]),
    JSON.stringify(client));

  const server = run(node, { statusCode: 500, payload: 'boom' });
  const retried = Array.isArray(server.out) && server.out[0] === null && server.out[1];
  check(`retry policy ${id}: 5xx retries once with backoff`,
    retried && server.out[1].delay === 500 && server.out[1][attemptsKey] === 1,
    JSON.stringify(server.out));

  const exhausted = run(node, { statusCode: 500, payload: 'boom', [attemptsKey]: 2 });
  check(`retry policy ${id}: 5xx stops at the configured limit`,
    exhausted.out === null && exhausted.errors.length === 1,
    JSON.stringify(exhausted));

  const custom = run(node, { statusCode: 503, payload: 'unavailable' }, { HTTP_MAX_RETRIES: '0' });
  check(`retry policy ${id}: HTTP_MAX_RETRIES=0 disables retries`,
    custom.out === null && custom.errors.length === 1,
    JSON.stringify(custom));

  const backoff = run(node, { statusCode: 502, payload: 'gw' }, { HTTP_RETRY_BACKOFF_MS: '250' });
  check(`retry policy ${id}: backoff is configurable`,
    Array.isArray(backoff.out) && backoff.out[1].delay === 250,
    JSON.stringify(backoff.out));
}

// --- check upstream status: non-retrying variant (tab-level requests) --------
const plain = flows.filter((n) => n && n.type === 'function' && n.name === 'check upstream status' && n.outputs === 1);
check('check upstream status: tab-level checks have a single output', plain.length === 10, `found ${plain.length}`);

for (const node of plain.slice(0, 2)) {
  const ok = run(node, { statusCode: 200, payload: {} });
  check(`check upstream ${node.id}: 2xx passes`, !Array.isArray(ok.out) && ok.out !== null && ok.errors.length === 0);
  const bad = run(node, { statusCode: 500, payload: 'boom' });
  check(`check upstream ${node.id}: 5xx raises for the catch handler`,
    bad.out === null && bad.errors.length === 1, JSON.stringify(bad));
}

// --- report -----------------------------------------------------------------
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} flow-logic check(s) failed:`);
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(`OK: flow function logic — ${passed} checks passed`);
