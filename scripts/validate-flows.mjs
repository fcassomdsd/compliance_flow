#!/usr/bin/env node
//
// Validates data/flows.json before it is imported into Node-RED.
//
// The flow file is the entire service, so a malformed edit (a duplicate id, or
// a wire/link that points at a node that no longer exists) currently only shows
// up at runtime. This script catches those cases in CI.
//
// Usage: node scripts/validate-flows.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const flowsPath = join(here, '..', 'data', 'flows.json');

let flows;

try {
  flows = JSON.parse(readFileSync(flowsPath, 'utf8'));
} catch (error) {
  console.error(`FAIL: data/flows.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(flows)) {
  console.error('FAIL: data/flows.json must be a JSON array of nodes');
  process.exit(1);
}

const problems = [];
const ids = new Set();
const duplicates = new Set();

for (const node of flows) {
  if (!node || typeof node !== 'object') {
    problems.push('encountered a non-object entry');
    continue;
  }

  if (typeof node.id !== 'string' || node.id.length === 0) {
    problems.push(`node of type "${node.type ?? '?'}" has no id`);
    continue;
  }

  if (ids.has(node.id)) {
    duplicates.add(node.id);
  }
  ids.add(node.id);
}

for (const id of duplicates) {
  problems.push(`duplicate node id: ${id}`);
}

const byId = new Map(flows.filter((n) => n && typeof n.id === 'string').map((n) => [n.id, n]));

function missing(target, from, kind) {
  if (typeof target !== 'string' || !ids.has(target)) {
    problems.push(`${kind} reference from ${from} points at missing node "${target}"`);
  }
}

for (const node of flows) {
  if (!node || typeof node.id !== 'string') {
    continue;
  }

  const label = `${node.type || 'node'}${node.name ? ` "${node.name}"` : ''} (${node.id})`;

  if (Array.isArray(node.wires)) {
    node.wires.forEach((targets, port) => {
      if (!Array.isArray(targets)) {
        return;
      }
      for (const target of targets) {
        missing(target, `${label} output ${port}`, 'wire');
      }
    });
  }

  if (Array.isArray(node.links)) {
    for (const target of node.links) {
      missing(target, label, 'link');
    }
  }

  if (Array.isArray(node.scope)) {
    for (const target of node.scope) {
      missing(target, label, 'catch scope');
    }
  }

  if (typeof node.z === 'string') {
    const parent = byId.get(node.z);
    if (!parent) {
      problems.push(`${label} belongs to missing tab/subflow ${node.z}`);
    } else if (parent.type !== 'tab' && parent.type !== 'subflow') {
      problems.push(`${label} belongs to ${node.z}, which is a "${parent.type}", not a tab or subflow`);
    }
  }
}

const tabs = flows.filter((n) => n && n.type === 'tab').length;
const subflows = flows.filter((n) => n && n.type === 'subflow').length;
const endpoints = flows.filter((n) => n && n.type === 'http in').length;

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} problem(s) found in data/flows.json:`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `OK: data/flows.json is structurally valid — ${flows.length} nodes, ` +
  `${tabs} tabs, ${subflows} subflows, ${endpoints} HTTP endpoints`
);
