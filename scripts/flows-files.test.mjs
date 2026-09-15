#!/usr/bin/env node
/**
 * Tests for scripts/split-flows.mjs and scripts/assemble-flows.mjs.
 *
 * They run against throwaway fixture trees (FLOWS_ROOT), so they never touch
 * data/flows.json or flows/. Run with:
 *
 *   node --test scripts/flows-files.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));

// Deliberately interleaved (a tab, one of its nodes, a subflow, its node, ...),
// the way Node-RED writes flows.json as nodes are created.
const NODES = [
  { id: 't1', type: 'tab', label: 'Tab One', disabled: false },
  { id: 'n1', type: 'function', z: 't1', func: 'return msg;', wires: [['n2']] },
  { id: 's1', type: 'subflow', name: 'My Sub', in: [], out: [] },
  { id: 'n2', type: 'function', z: 's1', func: 'return msg;', wires: [[]] },
  { id: 't2', type: 'tab', label: 'Tab/Twö' },
  { id: 'n3', type: 'debug', z: 't2', wires: [] },
];

function run(script, args, root) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [join(scriptsDir, script), ...args],
    { env: { ...process.env, FLOWS_ROOT: root }, encoding: 'utf8' },
  );
  return { code: status ?? 1, stdout: stdout ?? '', stderr: stderr ?? '' };
}

function fixture(t, nodes = NODES) {
  const root = mkdtempSync(join(tmpdir(), 'flows-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'data'), { recursive: true });
  if (nodes) {
    writeFileSync(join(root, 'data', 'flows.json'), `${JSON.stringify(nodes, null, 4)}\n`);
  }
  return root;
}

const readFlows = (root, name) =>
  JSON.parse(readFileSync(join(root, 'flows', name), 'utf8'));

test('split writes one file per tab and per subflow, container node first', (t) => {
  const root = fixture(t);
  const { code, stdout } = run('split-flows.mjs', [], root);
  assert.equal(code, 0, stdout);

  // Tab files are numbered by appearance; subflows are named after the subflow.
  assert.deepEqual(readFlows(root, '01-tab-one.json'), [NODES[0], NODES[1]]);
  assert.deepEqual(readFlows(root, '02-tabtwo.json'), [NODES[4], NODES[5]]);
  assert.deepEqual(readFlows(root, 'subflow-my-sub.json'), [NODES[2], NODES[3]]);

  // Running it twice is idempotent, and --check agrees.
  assert.equal(run('split-flows.mjs', [], root).code, 0);
  assert.equal(run('split-flows.mjs', ['--check'], root).code, 0);

  // split also rewrites the runtime file in canonical order.
  const flows = JSON.parse(readFileSync(join(root, 'data', 'flows.json'), 'utf8'));
  assert.deepEqual(
    flows.map((n) => n.id),
    ['t1', 'n1', 't2', 'n3', 's1', 'n2'],
  );
});

test('split re-canonicalises a node the editor appended at the end', (t) => {
  const root = fixture(t);
  // What Node-RED does when you drag a new node onto an existing tab.
  const nodes = JSON.parse(readFileSync(join(root, 'data', 'flows.json'), 'utf8'));
  nodes.push({ id: 'n4', type: 'debug', z: 't1', wires: [] });
  writeFileSync(join(root, 'data', 'flows.json'), `${JSON.stringify(nodes, null, 4)}\n`);

  assert.notEqual(run('assemble-flows.mjs', ['--check'], root).code, 0);
  assert.equal(run('split-flows.mjs', [], root).code, 0);

  // One command is enough: fragments and the runtime file agree again, with the
  // new node inside its own tab's block.
  assert.equal(run('assemble-flows.mjs', ['--check'], root).code, 0);
  assert.equal(run('split-flows.mjs', ['--check'], root).code, 0);
  const flows = JSON.parse(readFileSync(join(root, 'data', 'flows.json'), 'utf8'));
  assert.deepEqual(
    flows.map((n) => n.id),
    ['t1', 'n1', 'n4', 't2', 'n3', 's1', 'n2'],
  );
  assert.deepEqual(readFlows(root, '01-tab-one.json').map((n) => n.id), ['t1', 'n1', 'n4']);
});

test('assemble rebuilds every node, and --check then passes', (t) => {
  const root = fixture(t);
  assert.equal(run('split-flows.mjs', [], root).code, 0);
  assert.equal(run('assemble-flows.mjs', [], root).code, 0);
  assert.equal(run('assemble-flows.mjs', ['--check'], root).code, 0);

  const assembled = JSON.parse(readFileSync(join(root, 'data', 'flows.json'), 'utf8'));
  const key = (n) => JSON.stringify(n);
  assert.equal(assembled.length, NODES.length);
  assert.deepEqual(
    new Set(assembled.map(key)),
    new Set(NODES.map(key)),
    'assembly is lossless',
  );
  // The canonical order is grouped by flow file, so tabs come before subflows.
  assert.deepEqual(
    assembled.map((n) => n.id),
    ['t1', 'n1', 't2', 'n3', 's1', 'n2'],
  );
});

test('assemble --check fails when a fragment is edited', (t) => {
  const root = fixture(t);
  assert.equal(run('split-flows.mjs', [], root).code, 0);
  assert.equal(run('assemble-flows.mjs', [], root).code, 0);

  const path = join(root, 'flows', '01-tab-one.json');
  const fragment = JSON.parse(readFileSync(path, 'utf8'));
  fragment[1].func = 'return null;';
  writeFileSync(path, `${JSON.stringify(fragment, null, 4)}\n`);

  const { code, stderr } = run('assemble-flows.mjs', ['--check'], root);
  assert.notEqual(code, 0);
  assert.match(stderr, /out of sync/);
  assert.match(stderr, /first difference at index 1/);
});

test('split --check fails when data/flows.json changes without re-splitting', (t) => {
  const root = fixture(t);
  assert.equal(run('split-flows.mjs', [], root).code, 0);

  const target = join(root, 'data', 'flows.json');
  const nodes = JSON.parse(readFileSync(target, 'utf8'));
  nodes[1].func = 'return null;';
  writeFileSync(target, `${JSON.stringify(nodes, null, 4)}\n`);

  const { code, stderr } = run('split-flows.mjs', ['--check'], root);
  assert.notEqual(code, 0);
  assert.match(stderr, /differs: 01-tab-one\.json/);
});

test('split --check reports a renamed tab as a missing/stale file', (t) => {
  const root = fixture(t);
  assert.equal(run('split-flows.mjs', [], root).code, 0);

  const target = join(root, 'data', 'flows.json');
  const nodes = JSON.parse(readFileSync(target, 'utf8'));
  nodes[0].label = 'Renamed';
  writeFileSync(target, `${JSON.stringify(nodes, null, 4)}\n`);

  const { code, stderr } = run('split-flows.mjs', ['--check'], root);
  assert.notEqual(code, 0);
  assert.match(stderr, /missing: 01-renamed\.json/);
  assert.match(stderr, /stale:   01-tab-one\.json/);
});

test('assemble rejects duplicate node ids', (t) => {
  const root = fixture(t);
  assert.equal(run('split-flows.mjs', [], root).code, 0);

  writeFileSync(
    join(root, 'flows', '99-clash.json'),
    `${JSON.stringify([{ id: 'n1', type: 'function', z: 't1' }], null, 4)}\n`,
  );

  const { code, stderr } = run('assemble-flows.mjs', [], root);
  assert.notEqual(code, 0);
  assert.match(stderr, /duplicate node id "n1"/);
});

test('assemble rejects a node whose container is missing', (t) => {
  const root = fixture(t);
  assert.equal(run('split-flows.mjs', [], root).code, 0);

  writeFileSync(
    join(root, 'flows', '01-tab-one.json'),
    `${JSON.stringify([{ id: 't1', type: 'tab', label: 'Tab One' },
      { id: 'n1', type: 'function', z: 'gone' }], null, 4)}\n`,
  );

  const { code, stderr } = run('assemble-flows.mjs', [], root);
  assert.notEqual(code, 0);
  assert.match(stderr, /references unknown container "gone"/);
});

test('split parks nodes with an unknown container in zz-unassigned.json', (t) => {
  const root = fixture(t, [...NODES, { id: 'orphan', type: 'debug', z: 'gone' }]);
  const { code, stderr } = run('split-flows.mjs', [], root);
  assert.equal(code, 0);
  assert.match(stderr, /1 node\(s\) have no known container/);
  assert.deepEqual(readFlows(root, 'zz-unassigned.json'), [
    { id: 'orphan', type: 'debug', z: 'gone' },
  ]);
});
