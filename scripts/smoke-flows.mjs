#!/usr/bin/env node
//
// Read-only smoke harness for the Node-RED middleware (compliance_flow).
//
// Calls every safe (read-only / query) HTTP endpoint against a running stack
// and asserts the response is HTTP 200 with a JSON (or empty) body, and, for
// known list endpoints, a non-empty array. Endpoints that mutate state are
// listed but deliberately not exercised here — they need throwaway data and
// cleanup, so they are "skipped", not "failed".
//
// Usage:
//   BASE=http://localhost:1880 \
//   SPECIALTY_CODE=ATS \
//   INSPECTOR_EXTERNAL_ID=demo.inspector1 \
//   SITE_VISIT_ID=demo-sv-01 INSPECTION_ID=demo-insp-ans-01 INSPECTED_PROVIDER_ID=demo-iprov-ans \
//   LOCATION_CODE=ZZZZ \
//   node scripts/smoke-flows.mjs
//
// The defaults are the committed demo dataset's stable ids (`atrocore-docker/sql/
// seed-demo-dataset.sql`), not ids from a particular long-lived instance: this harness is run on
// a fresh clone by `atrocore-docker/scripts/demo-quickstart.sh`, and it used to fail there
// because its defaults pointed at records that only existed on the developer's instance.
//
// Exits 0 when every run test passes, 2 when any assertion fails. Skipped
// mutation endpoints never affect the exit code.

const BASE = (process.env.BASE || 'http://localhost:1880').replace(/\/$/, '');

// Node-RED gates every endpoint with `X-API-Key` when its `API_KEY` is set, which the deployed
// stack should have on. Pass it here (API_KEY, or NODE_RED_API_KEY as compliance_web names it) so
// the harness works either way instead of reporting 401s for a correctly configured gateway.
const API_KEY = process.env.API_KEY || process.env.NODE_RED_API_KEY || '';
const authHeaders = API_KEY ? { 'X-API-Key': API_KEY } : {};
const cfg = {
  specialtyCode: process.env.SPECIALTY_CODE || 'ATS',
  inspectorExternalId: process.env.INSPECTOR_EXTERNAL_ID || 'demo.inspector1',
  siteVisitId: process.env.SITE_VISIT_ID || 'demo-sv-01',
  inspectionId: process.env.INSPECTION_ID || 'demo-insp-ans-01',
  inspectedProviderId: process.env.INSPECTED_PROVIDER_ID || 'demo-iprov-ans',
  locationCode: process.env.LOCATION_CODE || 'ZZZZ',
};

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name) {
  passed += 1;
  console.log(`ok   ${name}`);
}

function bad(name, detail) {
  failed += 1;
  console.log(`FAIL ${name}: ${detail}`);
}

function skip(name, reason) {
  skipped += 1;
  console.log(`SKIP ${name}: ${reason}`);
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
      headers: { ...authHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, raw: text };
}

// A test either asserts JSON (any), a non-empty array, or a non-empty object.
const readOnlyTests = [
  { name: 'GET /specialties', path: '/specialties', expect: 'array' },
  { name: 'GET /location', path: '/location', expect: 'array' },
  { name: 'GET /activityTypes', path: '/activityTypes', expect: 'array' },
  { name: 'GET /serviceAreas', path: '/serviceAreas', expect: 'array' },
  { name: 'GET /siteVisits', path: '/siteVisits', expect: 'array' },
  { name: 'GET /inspectors?specialty=', path: '/inspectors', params: { specialty: cfg.specialtyCode }, expect: 'array' },
  { name: 'GET /inspector/:externalId', path: `/inspector/${cfg.inspectorExternalId}`, expect: 'json' },
  { name: 'GET /inspectionProvider', path: '/inspectionProvider', expect: 'array' },
  { name: 'GET /providers?siteVisit=', path: '/providers', params: { siteVisit: cfg.siteVisitId }, expect: 'array' },
  { name: 'GET /inspection/:inspectionId', path: `/inspection/${cfg.inspectionId}`, expect: 'json' },
  { name: 'GET /assignmentGroup/:externalGroup', path: '/assignmentGroup/test-group', expect: 'json' },
  // Search-backed (AFTS/Solr), so it lags a few seconds behind a status change — the same lag
  // the runbook documents for this endpoint. The demo walks a follow-up to Pending Closure
  // Approval immediately before this harness runs, so a single request can race the index and
  // see zero results even though the transition genuinely succeeded (confirmed repeatedly: the
  // same finding shows up correctly a few seconds later). Retried for that reason; every other
  // test here queries AtroCore directly through Node-RED, not a search index, so none of them
  // need this.
  { name: 'GET /findings/open?locationCode=&specialtyCode=', path: '/findings/open', params: { locationCode: cfg.locationCode, specialtyCode: cfg.specialtyCode }, expect: 'array', retries: 5, retryDelayMs: 3000 },
  { name: 'GET /checklist', path: '/checklist', params: { inspectionId: cfg.inspectionId, specialty: cfg.specialtyCode, siteVisitId: cfg.siteVisitId, inspectedProviderId: cfg.inspectedProviderId }, expect: 'object' },
  { name: 'GET /getLinks', path: '/getLinks', params: { entity: 'Inspection', id: cfg.inspectionId, link: 'inspectionSchedule' }, expect: 'json' },
  { name: 'POST /queryEntity', path: '/queryEntity', method: 'POST', params: { entity: 'Inspection', select: 'id,code' }, body: { id: cfg.inspectionId }, expect: 'json' },
];

// /content/lastSeq scans an Alfresco folder for the next follow-up sequence
// number. It is only meaningful with a real follow-up folder path, and a broad
// path (e.g. "/Company Home") makes the underlying children query slow, so it
// is opt-in rather than a default hard check.
const followupPrefix = process.env.FOLLOWUP_PREFIX;
const followupRelativePath = process.env.FOLLOWUP_RELATIVE_PATH;
if (followupPrefix && followupRelativePath) {
  readOnlyTests.push({
    name: 'GET /content/lastSeq',
    path: '/content/lastSeq',
    params: { prefix: followupPrefix, relativePath: followupRelativePath },
    expect: 'json',
  });
} else {
  skipped += 1;
  console.log('SKIP GET /content/lastSeq: needs FOLLOWUP_PREFIX + FOLLOWUP_RELATIVE_PATH (opt-in)');
}

const destructiveTests = [
  ['POST /addEntity', 'creates an entity'],
  ['PUT /updateEntity', 'mutates an entity'],
  ['DELETE /deleteEntity', 'deletes an entity'],
  ['POST /addLinks', 'creates entity links'],
  ['POST /deleteLinks', 'removes entity links'],
  ['GET /importCanonical', 'writes canonical documents and transitions inspection status'],
  ['POST /importFollowUps', 'imports follow-up reports'],
  ['GET /inspectionPlan', 'generates a plan and transitions status to Planned'],
  ['GET /inspectionReport', 'generates a report and transitions status to Reported'],
];

function satisfies(result, expect) {
  if (result.status !== 200) {
    return `HTTP ${result.status}${result.raw ? ` (${result.raw.slice(0, 120)})` : ''}`;
  }
  if (result.raw.trim() && result.json === null) {
    return 'response is not valid JSON';
  }
  if (expect === 'array' && (!Array.isArray(result.json) || result.json.length === 0)) {
    return 'expected a non-empty JSON array';
  }
  if (expect === 'object' && (typeof result.json !== 'object' || result.json === null || Array.isArray(result.json))) {
    return 'expected a JSON object';
  }
  if (expect === 'json' && result.json === null) {
    // An empty body used to satisfy this check, which is how
    // `/inspection/:inspectionId` returned 200 with nothing for months.
    return result.raw.trim() ? 'expected a JSON body' : 'expected a JSON body, got an empty response';
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`smoke-flows: target ${BASE}`);
  for (const t of readOnlyTests) {
    const attempts = 1 + (t.retries || 0);
    let problem = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await call(t);
        problem = satisfies(result, t.expect);
      } catch (error) {
        problem = error.message;
      }
      if (!problem) break;
      if (attempt < attempts) {
        console.log(`  retry ${t.name} (${attempt}/${attempts}): ${problem}`);
        await sleep(t.retryDelayMs || 1000);
      }
    }
    if (problem) bad(t.name, problem);
    else ok(t.name);
  }
  for (const [name, reason] of destructiveTests) {
    skip(name, `destructive (${reason}) — needs throwaway data + cleanup`);
  }

  console.log(`\nsmoke-flows: ${passed} passed, ${failed} failed, ${skipped} skipped (destructive)`);
  process.exit(failed > 0 ? 2 : 0);
}

main();
