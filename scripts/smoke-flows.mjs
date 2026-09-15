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
//   SPECIALTY_CODE=MET \
//   INSPECTOR_EXTERNAL_ID=osvaldo.delgadillo \
//   SITE_VISIT_ID=... INSPECTION_ID=... INSPECTED_PROVIDER_ID=... \
//   LOCATION_CODE=MDPP \
//   node scripts/smoke-flows.mjs
//
// Exits 0 when every run test passes, 2 when any assertion fails. Skipped
// mutation endpoints never affect the exit code.

const BASE = (process.env.BASE || 'http://localhost:1880').replace(/\/$/, '');
const cfg = {
  specialtyCode: process.env.SPECIALTY_CODE || 'MET',
  inspectorExternalId: process.env.INSPECTOR_EXTERNAL_ID || 'osvaldo.delgadillo',
  siteVisitId: process.env.SITE_VISIT_ID || 'a01m1xss7xge4z9gygvcmj3mb64',
  inspectionId: process.env.INSPECTION_ID || 'a01m1xst8faebz93nas6xdht053',
  inspectedProviderId: process.env.INSPECTED_PROVIDER_ID || 'a01m1xssv0tedgr0jmfwt3b2mh3',
  locationCode: process.env.LOCATION_CODE || 'MDPP',
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
  { name: 'GET /findings/open?locationCode=&specialtyCode=', path: '/findings/open', params: { locationCode: cfg.locationCode, specialtyCode: cfg.specialtyCode }, expect: 'array' },
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

async function main() {
  console.log(`smoke-flows: target ${BASE}`);
  for (const t of readOnlyTests) {
    try {
      const result = await call(t);
      const problem = satisfies(result, t.expect);
      if (problem) bad(t.name, problem);
      else ok(t.name);
    } catch (error) {
      bad(t.name, error.message);
    }
  }
  for (const [name, reason] of destructiveTests) {
    skip(name, `destructive (${reason}) — needs throwaway data + cleanup`);
  }

  console.log(`\nsmoke-flows: ${passed} passed, ${failed} failed, ${skipped} skipped (destructive)`);
  process.exit(failed > 0 ? 2 : 0);
}

main();
