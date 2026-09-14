#!/usr/bin/env node
//
// Audits the error-response behaviour of the Node-RED middleware and reports
// which endpoints return a consistent error envelope.
//
// A "proper" error response is: HTTP status >= 400 AND a JSON body shaped
// { success: false, error: <non-empty string or object> }. This is the target
// contract for the P2.1 "one error envelope" step; today several endpoints
// return HTTP 200 with a raw error string or an empty body instead (the
// http request nodes do not throw on upstream failure by default).
//
// By default this only reports (exit 0); pass --enforce to exit 1 until every
// probe returns the envelope. That makes it the gate for the envelope work:
//   node scripts/audit-error-envelope.mjs            # report
//   node scripts/audit-error-envelope.mjs --enforce  # fail until fixed
//
// Usage (test data mirrors scripts/smoke-flows.mjs):
//   BASE=... SPECIALTY_CODE=... SITE_VISIT_ID=... node scripts/audit-error-envelope.mjs

const BASE = (process.env.BASE || 'http://localhost:1880').replace(/\/$/, '');
const enforce = process.argv.includes('--enforce');

const probes = [
  { name: 'GET /inspectors (missing specialty)', method: 'GET', path: '/inspectors' },
  { name: 'POST /addEntity (unknown entity)', method: 'POST', path: '/addEntity', params: { entity: 'BogusEntityType' }, body: { name: 'x' } },
  { name: 'DELETE /deleteEntity (unknown id)', method: 'DELETE', path: '/deleteEntity', params: { entity: 'Inspection', id: 'bogus-id' } },
  { name: 'POST /queryEntity (unknown entity)', method: 'POST', path: '/queryEntity', params: { entity: 'Bogus', select: 'id' }, body: { id: 'x' } },
  { name: 'GET /inspector/:externalId (unknown)', method: 'GET', path: '/inspector/bogus.user' },
];

function isProperEnvelope({ status, json }) {
  if (status < 400) return false;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  if (json.success !== false) return false;
  const error = json.error;
  if (error === null || error === undefined) return false;
  if (typeof error === 'string') return error.trim().length > 0;
  if (typeof error === 'object') return Object.keys(error).length > 0;
  return false;
}

async function call({ method = 'GET', path, params, body }) {
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TIMEOUT_MS || 20000));
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json = null;
  if (text.trim()) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, json, raw: text };
}

async function main() {
  let pass = 0;
  let fail = 0;

  console.log(`audit-error-envelope: target ${BASE}`);
  for (const p of probes) {
    let result;
    try {
      result = await call(p);
    } catch (error) {
      fail += 1;
      console.log(`FAIL ${p.name}: request error ${error.message}`);
      continue;
    }
    const ok = isProperEnvelope(result);
    const body = result.raw.trim().slice(0, 120) || '(empty)';
    const verdict = ok ? 'ok  ' : 'FAIL';
    if (ok) pass += 1; else fail += 1;
    console.log(`${verdict} ${p.name}: HTTP ${result.status}, body ${body}`);
  }

  console.log(`\naudit-error-envelope: ${pass} pass, ${fail} fail`);
  if (enforce && fail > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
