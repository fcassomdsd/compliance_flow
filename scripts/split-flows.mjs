#!/usr/bin/env node
/**
 * Split the single Node-RED flow file (`data/flows.json`) into one file per
 * tab and per subflow under `flows/`, so that changes to one flow no longer
 * touch a 7k-line file and reviewers can see which flow changed.
 *
 * This is the inverse of `scripts/assemble-flows.mjs`. Node-RED itself can only
 * load a single flow file per installation (Projects included), so the editor
 * still writes `data/flows.json`; run this script after editing in the editor,
 * or edit `flows/*.json` directly and run the assemble script.
 *
 * Besides writing `flows/*.json`, this script rewrites `data/flows.json` in
 * canonical order (the fragments concatenated in filename order), so running it
 * once after an editor session always leaves both sides consistent — the editor
 * appends new nodes at the end of the array, which is not their canonical spot.
 *
 * Usage:
 *   node scripts/split-flows.mjs           # data/flows.json -> flows/*.json
 *   node scripts/split-flows.mjs --check   # fail if flows/ is out of date
 *
 * Ordering: tabs are numbered by their order of appearance in `data/flows.json`
 * (`01-...`, `02-...`), subflows are `subflow-<name>.json`. Assembling the files
 * in filename order therefore reproduces the canonical flow order, which makes
 * `split` -> `assemble` a lossless round trip.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// FLOWS_ROOT points the scripts at a fixture tree; used by
// scripts/flows-files.test.mjs.
const root = process.env.FLOWS_ROOT
  ? resolve(process.env.FLOWS_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'data', 'flows.json');
const OUT_DIR = join(root, 'flows');
const UNASSIGNED = 'zz-unassigned.json';

const args = process.argv.slice(2);
const check = args.includes('--check');
if (args.some((a) => a !== '--check' && a !== '--help')) {
  console.error(`Unknown argument: ${args.find((a) => a !== '--check' && a !== '--help')}`);
  process.exit(2);
}

function slug(value) {
  const out = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  return out || 'untitled';
}

function fail(message) {
  console.error(`split-flows: ${message}`);
  process.exit(1);
}

let nodes;
try {
  nodes = JSON.parse(readFileSync(SOURCE, 'utf8'));
} catch (err) {
  fail(`cannot read ${SOURCE}: ${err.message}`);
}
if (!Array.isArray(nodes)) fail(`${SOURCE} is not a JSON array of nodes`);

// Index the flow containers (tabs and subflow definitions) in appearance order.
const containers = [];
const byId = new Map();
for (const node of nodes) {
  if (node.type !== 'tab' && node.type !== 'subflow') continue;
  if (byId.has(node.id)) fail(`duplicate container id "${node.id}"`);
  const entry = { id: node.id, type: node.type, node, children: [] };
  containers.push(entry);
  byId.set(node.id, entry);
}

// Attach every other node to its container via `z`.
const unassigned = [];
for (const node of nodes) {
  if (node.type === 'tab' || node.type === 'subflow') continue;
  const parent = byId.get(node.z);
  if (parent) parent.children.push(node);
  else unassigned.push(node);
}

const files = new Map();
let tabIndex = 0;
for (const entry of containers) {
  const name =
    entry.type === 'tab'
      ? `${String((tabIndex += 1)).padStart(2, '0')}-${slug(entry.node.label)}.json`
      : `subflow-${slug(entry.node.name ?? entry.node.label)}.json`;
  if (files.has(name)) fail(`two flows map to the same file "${name}"`);
  files.set(name, [entry.node, ...entry.children]);
}
if (unassigned.length > 0) {
  files.set(UNASSIGNED, unassigned);
  console.warn(
    `split-flows: warning: ${unassigned.length} node(s) have no known container ` +
      `(z not a tab/subflow id) and were written to flows/${UNASSIGNED}`,
  );
}

const names = [...files.keys()].sort();
const total = nodes.length;
const written = new Map();

function render(list) {
  return `${JSON.stringify(list, null, 4)}\n`;
}

if (check) {
  let current = [];
  try {
    current = readdirSync(OUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    fail(`flows/ does not exist; run: node scripts/split-flows.mjs`);
  }
  const missing = names.filter((n) => !current.includes(n));
  const extra = current.filter((n) => !names.includes(n));
  const changed = [];
  for (const name of names) {
    if (!current.includes(name)) continue;
    const onDisk = readFileSync(join(OUT_DIR, name), 'utf8');
    if (onDisk !== render(files.get(name))) changed.push(name);
  }
  if (missing.length || extra.length || changed.length) {
    if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
    if (extra.length) console.error(`  stale:   ${extra.join(', ')}`);
    if (changed.length) console.error(`  differs: ${changed.join(', ')}`);
    fail(
      'flows/ is out of sync with data/flows.json ' +
        '(run: node scripts/split-flows.mjs, then commit both)',
    );
  }
  console.log(`split-flows: ok (${names.length} flow files, ${total} nodes)`);
  process.exit(0);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
for (const name of names) {
  writeFileSync(join(OUT_DIR, name), render(files.get(name)));
  written.set(name, files.get(name).length);
}

// Rewrite the runtime file in canonical order (fragments concatenated in
// filename order) so that a single `split` leaves the tree consistent even after
// the editor appended new nodes at the end of data/flows.json.
writeFileSync(SOURCE, render(names.flatMap((name) => files.get(name))));

const width = Math.max(...names.map((n) => n.length));
for (const name of names) {
  console.log(`  ${name.padEnd(width)}  ${String(written.get(name)).padStart(3)} nodes`);
}
console.log(
  `split-flows: wrote ${names.length} flow files to flows/ (${total} nodes total) ` +
    `and re-assembled data/flows.json`,
);
