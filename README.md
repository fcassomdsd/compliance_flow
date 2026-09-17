# Node-RED — Compliance Inspection API

A Node-RED service that acts as the integration middleware for an aviation compliance inspection management system. It exposes a REST API consumed by the front-end checklist application and orchestrates data flow between the **AtroCRM/AtroCore** backend and an **Alfresco** document management system.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Whole-Platform Demo Quickstart](#whole-platform-demo-quickstart)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Flows](#flows)
- [Project Structure](#project-structure)

---

## Overview

This service is the back-end integration layer for an aviation CNS (Communication, Navigation and Surveillance) inspection platform. It:

- Serves structured checklist questions to a mobile/web inspection application.
- Performs CRUD operations on inspection entities stored in AtroCRM.
- Manages document import and retrieval via Alfresco.
- Generates inspection plans and reports.
- Handles follow-up findings and open findings tracking.

---

## Architecture

```
┌────────────────────┐        REST (port 1880)
│  Checklist / Front │ ──────────────────────────┐
│  End Application   │                           ▼
└────────────────────┘              ┌────────────────────┐
                                    │   Node-RED (this)  │
                                    └───────┬────────────┘
                          ┌─────────────────┼──────────────────┐
                          ▼                 ▼                  ▼
               ┌──────────────────┐ ┌─────────────┐ ┌──────────────────┐
               │  AtroCRM/        │ │  Alfresco   │ │  Import Service  │
               │  AtroCore        │ │  (DMS)      │ │                  │
               │  (backend_net)   │ │ (alfresco_  │ │ (import-backend) │
               └──────────────────┘ │  backend)  │ └──────────────────┘
                                    └─────────────┘
```

Node-RED connects to three external Docker networks defined in the compose file.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- The following external Docker networks must exist before starting this service:
  - `backend_net` — AtroCRM/AtroCore backend
  - `alfresco_backend` — Alfresco document management
  - `import-backend` — Import service

Create missing networks with:

```bash
docker network create backend_net
docker network create alfresco_backend
docker network create import-backend
```

---

## Getting Started

1. **Clone the repository** (if not already done):

   ```bash
   git clone <repository-url>
   cd compliance_repo/compliance_flow
   ```

2. **Start the service**:

   ```bash
   docker-compose up -d
   ```

3. **Access the Node-RED editor**:

   Open your browser at [http://localhost:1880](http://localhost:1880)

4. **Stop the service**:

   ```bash
   docker-compose down
   ```

---

## Whole-Platform Demo Quickstart

Taking a running stack to a demonstrable dataset and a walked finding-closure
workflow means exercising every service, so the canonical sequence lives once, in
the `atrocore-docker` repository: §7 of
`../atrocore-docker/docs/COMPLIANCE_INTEGRATION_RUNBOOK.md`
("Demo Quickstart — clean clone to a demonstrable system"), executable as
`atrocore-docker/scripts/demo-quickstart.sh`. This service is a step in it (the
inspection plan/report and canonical-import endpoints); the runbook also records
the failure-isolation cues for when a flow misbehaves.

---

## Configuration

| File | Purpose |
|---|---|
| `docker-compose.yaml` | Container definition, port mapping, and network membership |
| `data/settings.js` | Node-RED runtime configuration (port, security, flow file, etc.) |
| `flows/*.json` | **The maintained flow definitions** — one file per tab and per subflow |
| `data/flows.json` | The runtime flow file: `flows/*.json` concatenated in filename order |
| `data/flows_cred.json` | Encrypted credentials used by flows (do **not** commit plaintext secrets) |
| `data/package.json` | Node-RED project metadata and custom node dependencies |
| `.env.example` | Environment variable template (copy to `.env` before deployment) |

### Key settings (`data/settings.js`)

- **Port**: `1880` (overridable via the `PORT` environment variable)
- **Flow file**: `flows.json`
- **Credential encryption**: `credentialSecret` is set via `NODE_RED_CREDENTIAL_SECRET` env var with a dev default
- **Editor auth**: `adminAuth` is enabled — login required to access the Node-RED editor
- **API auth**: all REST endpoints are gated by `httpNodeMiddleware` — when `API_KEY` is set (the shipped `.env.example` default, since 2026-09), requests require a matching `X-API-Key` header; leave it empty only for local development where nothing else points at this gateway

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TZ` | `Europe/Amsterdam` | Container timezone |
| `ALFRESCO_USERNAME` / `ALFRESCO_PASSWORD` | *(required)* | Alfresco credentials (used when the caller does not forward a user ticket) |
| `ATROCORE_USERNAME` / `ATROCORE_PASSWORD` | *(required)* | AtroCore credentials |
| `API_KEY` | *(demo placeholder — change it)* | Shared secret for REST endpoint protection; unset = no auth (dev mode only) |
| `ADMIN_USERNAME` | `admin` | Node-RED editor login username |
| `ADMIN_PASSWORD_HASH` | *(bcrypt hash)* | Node-RED editor login password (bcrypt hash) |
| `NODE_RED_CREDENTIAL_SECRET` | *(required)* | Encryption key for flow credentials — change in production |
| `NODE_ENV` | `development` | `production` enables the startup validation (fails on missing secrets) |
| `ATROCORE_BASE_URL` | `http://atro-web/api/v1` | AtroCore API base URL used by every `http request` node |
| `ALFRESCO_BASE_URL` | `http://proxy:8080/alfresco` | Alfresco base URL used by every `http request` node |
| `HTTP_REQUEST_TIMEOUT_MS` | *(empty → 5000)* | Per-request timeout in ms; empty keeps the node's own 5s default |
| `HTTP_MAX_RETRIES` | `2` | Extra attempts for the auth/query/CRUD subflows' upstream calls |
| `HTTP_RETRY_BACKOFF_MS` | `500` | Base backoff in ms; attempt N waits `N × backoff` |

The base URLs and timeout are read per request by the `set env config` function nodes
(`env.get(...)` → `msg.atrocoreBaseUrl` / `msg.alfrescoBaseUrl` / `msg.requestTimeout`).
They must be **msg** properties: the `http request` node renders its URL with
`mustache.render(url, msg)` against `msg` only, and mustache HTML-escapes `{{ }}`
values — hence the triple-braced `{{{atrocoreBaseUrl}}}` in the URL templates.

---

## API Reference

All endpoints are served at `http://<host>:1880`.

### Checklist

| Method | Path | Description |
|---|---|---|
| `GET` | `/checklist` | Returns checklist questions in JSON format for a given inspected specialty |

### Entity CRUD (AtroCRM proxy)

| Method | Path | Description |
|---|---|---|
| `POST` | `/queryEntity` | Query entities by type and filter criteria |
| `PUT` | `/updateEntity` | Update an existing entity |
| `POST` | `/addEntity` | Create a new entity |
| `DELETE` | `/deleteEntity` | Delete an entity |

### Entity Links

| Method | Path | Description |
|---|---|---|
| `GET` | `/getLinks` | Retrieve relationship links between entities |
| `POST` | `/addLinks` | Create relationship links between entities |
| `POST` | `/deleteLinks` | Remove relationship links between entities |

### Inspection Workflows

| Method | Path | Description |
|---|---|---|
| `GET` | `/inspectionPlan` | Generate an inspection plan; after successful generation, transitions AtroCore inspection status to `Planned`. Answers with the generated document — `generatedFile.name`/`path`/`version`/`downloadURL`, plus `inspectionId` and `inspectionStatus` — or with the error envelope naming what was missing when `siteVisit` or `provider` does not resolve |
| `GET` | `/inspectionReport` | Generate an inspection report; after successful generation, transitions AtroCore inspection status to `Reported` |
| `POST` | `/importFollowUps` | Import follow-up items into the system |
| `GET` | `/importCanonical` | Import canonical inspection data into Alfresco; after successful import, transitions AtroCore inspection status from `Planned` to `Uploaded` |
| `GET` | `/inspection/:inspectionId` | Query a single inspection entity by id (also accepts its `code`) |

### Alfresco Integration

| Method | Path | Description |
|---|---|---|
| `GET` | `/content/lastSeq` | Get the last content sequence number from Alfresco |

### Static / Reference Data

| Method | Path | Description |
|---|---|---|
| `GET` | `/serviceAreas` | List all service areas with linked specialties |
| `GET` | `/inspectionProvider` | List per-provider inspections with provider data (filterable by `?status=`) |
| `GET` | `/providers` | List providers for a site visit |
| `GET` | `/siteVisits` | List site visits eligible for checklist upload |
| `GET` | `/inspector/:externalId` | Get inspector details by external ID (includes `serviceAreaId`) |
| `GET` | `/assignmentGroup/:externalGroup` | Get assignment group by external group identifier |
| `GET` | `/specialties` | List all available inspection specialties |
| `GET` | `/inspectors?specialty=<code>` | List the inspectors linked to a specialty code (`id`, `name`, `externalUserID`) |
| `GET` | `/activityTypes` | List all available activity types (`id`, `code`, `name`) |
| `GET` | `/location` | List available inspection locations |

### Findings

| Method | Path | Description |
|---|---|---|
| `GET` | `/findings/open` | Retrieve all open findings |

---

## Flows

The Node-RED editor organises logic into the following tabs (flows):

| Flow | Description |
|---|---|
| **getChecklistQuestion** | Builds and returns checklist questions for the front end, given an inspected specialty ID |
| **Query entity** | Generic entity query against AtroCRM (`POST /queryEntity`) |
| **Update entity** | Generic entity update against AtroCRM (`PUT /updateEntity`) |
| **Add entity** | Generic entity creation in AtroCRM |
| **Delete entity** | Generic entity deletion in AtroCRM |
| **Get links** | Retrieves entity relationship links |
| **Add links** | Creates entity relationship links |
| **Delete links** | Removes entity relationship links |
| **Inspection plan** | Builds and serves an inspection plan; updates AtroCore inspection status to `Planned` |
| **import canonical to alfresco** | Exports canonical inspection records to Alfresco; queries AtroCore and transitions status from `Planned` to `Uploaded` |
| **Inspection report** | Compiles and returns a full inspection report; updates AtroCore inspection status to `Reported` |
| **Auth flows** | OAuth/API-key helper flows for the authenticated endpoints |
| **Static data** | Serves reference / lookup data (inspectors, locations, specialties, groups) |
| **findings flows** | Manages open findings lifecycle |
| **follow up flows** | Manages follow-up items after inspections |

### Subflows

Reusable logic extracted from the tabs above. A Subflow is instantiated wherever it is needed, which replaced the previous `link call`/`link in` pattern for these paths.

| Subflow | Description | Instances |
|---|---|---|
| **getAtrocoreTicket** | Obtains and caches an AtroCore API token and sets the `Authorization` header | used by the query/update/links subflows and the Add/Delete entity and links tabs |
| **getAlfrescoTicket** | Obtains an Alfresco ticket, preferring a forwarded `X-Alfresco-Ticket`, and sets `alf_ticket` | inspection plan/report, import canonical, findings and follow-up flows |
| **queryEntity** | Reads records from AtroCore (wraps `getAtrocoreTicket`) | heavily reused across the query/report/static-data tabs |
| **getEntityLinks** | Reads an entity's relationship links from AtroCore | Get links and Inspection plan |
| **updateEntity** | Updates an AtroCore record (wraps `getAtrocoreTicket`) | Update entity, import canonical, Inspection report |

---

## Smoke testing

**On a fresh checkout, run `scripts/bootstrap-node-red-data.sh` before `docker compose up`.** Node-RED runs as uid 1000 and writes into `/data`, which is a bind mount of this repository's tracked `data/` — on a machine whose user is not uid 1000 the container cannot create `node_modules`, logs `EACCES: permission denied, mkdir '/data/node_modules'` and exits (showing as `Exited (0)`, so the port simply never answers). The script chowns the directory to the container's user when run as root and makes it world-writable otherwise.

`scripts/smoke-flows.mjs` is a read-only smoke harness that calls the safe HTTP endpoints against a running stack and asserts each returns HTTP 200 with a JSON body (and, for list endpoints, a non-empty array). Endpoints that mutate state (`addEntity`, `updateEntity`, `deleteEntity`, `addLinks`, `deleteLinks`, `importCanonical`, `importFollowUps`, `inspectionPlan`, `inspectionReport`) are listed but not exercised — they need throwaway data and cleanup — so they are skipped, not failed.

```bash
# stack up first (see the runbook), then:
BASE=http://localhost:1880 \
SPECIALTY_CODE=MET \
INSPECTOR_EXTERNAL_ID=osvaldo.delgadillo \
SITE_VISIT_ID=<siteVisitId> \
INSPECTION_ID=<inspectionId> \
INSPECTED_PROVIDER_ID=<inspectedProviderId> \
node scripts/smoke-flows.mjs
```

`/content/lastSeq` is opt-in (it scans an Alfresco folder, and a broad path is slow): set `FOLLOWUP_PREFIX` and `FOLLOWUP_RELATIVE_PATH` to include it. The harness needs `curl`-free Node 18+ only (it uses global `fetch`), exits `0` when all run tests pass and `2` on any assertion failure. Because `compliance_flow`'s CI has no live stack, this is a local/documented gate — CI still enforces `validate-flows.mjs` (structure) and `verify-endpoints.mjs` (endpoint manifest).

### Error-envelope audit

`scripts/audit-error-envelope.mjs` reports how error responses currently behave and is the gate for the P2.1 "one error envelope" work. A "proper" error is **HTTP ≥ 400 with a JSON body `{ "success": false, "error": … }`**. Today several endpoints return HTTP 200 with a raw error string or an empty body (the `http request` nodes do not throw on upstream failure by default), so the audit reports `0 pass / 5 fail` until that is fixed in the editor:

```bash
node scripts/audit-error-envelope.mjs            # report only (exit 0)
node scripts/audit-error-envelope.mjs --enforce  # exit 1 until every probe passes
```

---

## Flow file layout

Node-RED loads exactly one flow file (Projects included — `data/settings.js` has
projects disabled), so `data/flows.json` stays the runtime artifact. The flow is
**maintained** as one file per tab and per subflow under `flows/`, so a change to
one flow is a diff in one small file instead of in a 7,500-line JSON blob:

```
flows/
├── 01-getchecklistquestion.json          # tab "getChecklistQuestion" (container node first)
├── 02-query-entity.json
├── …
├── 15-follow-up-flows.json
├── subflow-getatrocoreticket.json        # subflow definition + its nodes
├── subflow-queryentity.json
└── …
```

`data/flows.json` is those files concatenated in filename order (tabs in their
original order, then subflows, then any node whose `z` is not a known tab).

```bash
node scripts/split-flows.mjs             # data/flows.json -> flows/*.json (and re-canonicalise data/flows.json)
node scripts/assemble-flows.mjs          # flows/*.json -> data/flows.json
node scripts/split-flows.mjs --check     # fail if flows/ is stale (CI)
node scripts/assemble-flows.mjs --check  # fail if data/flows.json is stale (CI)
node --test scripts/flows-files.test.mjs # round-trip and failure-mode tests
```

**Which command to run after editing**

- Edited in the Node-RED editor? Run `node scripts/split-flows.mjs`. The editor
  writes `data/flows.json` and appends new nodes at the end of the array, so this
  one command updates `flows/` *and* rewrites `data/flows.json` in canonical
  order, leaving the tree consistent.
- Edited `flows/*.json` directly? Run `node scripts/assemble-flows.mjs`.

Commit both sides; the `validate:flows` CI job fails when the fragments and the
runtime file disagree. Renaming a tab renames its file (the numeric prefix is the
tab's order of appearance), and adding or removing a tab renumbers the tabs after
it — a reviewable rename, not a content change.

---

## Project Structure

```
compliance_flow/
├── docker-compose.yaml       # Docker service definition
├── flows/                    # One flow file per tab/subflow (the maintained source)
│   ├── 01-getchecklistquestion.json
│   └── subflow-getatrocoreticket.json
├── data/                     # Mounted into the container as /data
│   ├── flows.json            # Runtime flow file, assembled from ../flows/
│   ├── flows_cred.json       # Encrypted flow credentials
│   ├── package.json          # Project metadata / custom node deps
│   ├── settings.js           # Node-RED runtime configuration
│   └── lib/
│       └── flows/            # (reserved for reusable sub-flow libraries)
└── scripts/                  # Validation and smoke tooling (run on the host, not in the container)
    ├── split-flows.mjs           # data/flows.json -> flows/ (after editor edits)
    ├── assemble-flows.mjs        # flows/ -> data/flows.json
    ├── flows-files.test.mjs      # Round-trip tests for the two above (CI)
    ├── validate-flows.mjs        # Structural flow validation (CI)
    ├── verify-endpoints.mjs      # README endpoint manifest check (CI)
    ├── smoke-flows.mjs           # Read-only live smoke harness (local)
    └── audit-error-envelope.mjs  # Error-response audit / envelope gate (local)
```

---

## Security Notes

- **`adminAuth` is enabled** — the Node-RED editor requires login (username/password from `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` env vars).
- **API key protection**: when `API_KEY` env var is set (the shipped default), every REST endpoint requires a matching `X-API-Key` header. **The `.env.example` value is a public placeholder** — generate a real value (`openssl rand -hex 32`) and set the same one in `compliance_web`'s `NODE_RED_API_KEY` and `compliance_import`'s `IMPORT_API_KEY` before any deployment reachable by anyone you do not trust.
- **`credentialSecret`** is managed via `NODE_RED_CREDENTIAL_SECRET` env var — set a unique value in production.
- **Alfresco credentials** are read from `ALFRESCO_USERNAME`/`ALFRESCO_PASSWORD` env vars. Frontend apps can forward user-specific Alfresco tickets via the `X-Alfresco-Ticket` header, which the auth flow will use preferentially over env var credentials.
- **`.gitignore`** excludes backup files (`.backup`), runtime configs (`.config.*.json`), and `node_modules/`.
- Consider placing Node-RED behind a reverse proxy (e.g., nginx) with TLS for production deployments.
