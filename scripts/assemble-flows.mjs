#!/usr/bin/env node
/**
 * Assemble the per-tab/per-subflow files under `flows/` back into the single
 * Node-RED flow file `data/flows.json` that the runtime actually loads.
 *
 * This is the inverse of `scripts/split-flows.mjs`; the pair is a lossless round
 * trip. `data/flows.json` is committed (Node-RED needs it at startup) and
 * `--check` proves in CI that it still matches the `flows/` fragments.
 *
 * Usage:
 *   node scripts/assemble-flows.mjs           # flows/*.json -> data/flows.json
 *   node scripts/assemble-flows.mjs --check   # fail if data/flows.json is stale
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// FLOWS_ROOT points the scripts at a fixture tree; used by
// scripts/flows-files.test.mjs.
const root = process.env.FLOWS_ROOT
  ? resolve(process.env.FLOWS_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN_DIR = join(root, 'flows');
const TARGET = join(root, 'data', 'flows.json');

const args = process.argv.slice(2);
const check = args.includes('--check');
if (args.some((a) => a !== '--check')) {
  console.error(`Unknown argument: ${args.find((a) => a !== '--check')}`);
  process.exit(2);
}

function fail(message) {
  console.error(`assemble-flows: ${message}`);
  process.exit(1);
}

let names;
try {
  names = readdirSync(IN_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
} catch (err) {
  fail(`cannot read ${IN_DIR}: ${err.message}`);
}
if (names.length === 0) fail(`${IN_DIR} contains no .json flow files`);

const assembled = [];
const seen = new Set();
for (const name of names) {
  let list;
  try {
    list = JSON.parse(readFileSync(join(IN_DIR, name), 'utf8'));
  } catch (err) {
    fail(`cannot parse flows/${name}: ${err.message}`);
  }
  if (!Array.isArray(list)) fail(`flows/${name} is not a JSON array of nodes`);
  for (const node of list) {
    if (!node || typeof node.id !== 'string') {
      fail(`flows/${name} contains a node without a string id`);
    }
    if (seen.has(node.id)) fail(`duplicate node id "${node.id}" (in flows/${name})`);
    seen.add(node.id);
    assembled.push(node);
  }
}

// Every non-container node must point at a container defined in some fragment,
// otherwise the editor/runtime would drop it silently.
const containerIds = new Set(
  assembled.filter((n) => n.type === 'tab' || n.type === 'subflow').map((n) => n.id),
);
for (const node of assembled) {
  if (node.type === 'tab' || node.type === 'subflow') continue;
  if (!containerIds.has(node.z)) {
    fail(`node "${node.id}" (${node.type}) references unknown container "${node.z}"`);
  }
}

const rendered = `${JSON.stringify(assembled, null, 4)}\n`;

if (check) {
  let onDisk;
  try {
    onDisk = readFileSync(TARGET, 'utf8');
  } catch (err) {
    fail(`cannot read ${TARGET}: ${err.message}`);
  }
  const a = JSON.stringify(JSON.parse(onDisk));
  const b = JSON.stringify(assembled);
  if (a !== b) {
    const onDiskNodes = JSON.parse(onDisk);
    const limit = Math.max(onDiskNodes.length, assembled.length);
    for (let i = 0; i < limit; i += 1) {
      const x = onDiskNodes[i];
      const y = assembled[i];
      if (JSON.stringify(x) !== JSON.stringify(y)) {
        console.error(
          `  first difference at index ${i}: ` +
            `data/flows.json has ${x ? `"${x.id}" (${x.type})` : 'nothing'}, ` +
            `flows/ has ${y ? `"${y.id}" (${y.type})` : 'nothing'}`,
        );
        break;
      }
    }
    fail(
      'data/flows.json is out of sync with flows/ ' +
        '(run: node scripts/assemble-flows.mjs, then commit both)',
    );
  }
  console.log(
    `assemble-flows: ok (${names.length} flow files, ${assembled.length} nodes)`,
  );
  process.exit(0);
}

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, rendered);
console.log(
  `assemble-flows: wrote data/flows.json from ${names.length} flow files ` +
    `(${assembled.length} nodes)`,
);
