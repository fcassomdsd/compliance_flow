# Node-RED — Compliance Inspection API

A Node-RED service that acts as the integration middleware for an aviation compliance inspection management system. It exposes a REST API consumed by the front-end checklist application and orchestrates data flow between the **AtroCRM/AtroCore** backend and an **Alfresco** document management system.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
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
   cd compliance_repo/node-red
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

## Configuration

| File | Purpose |
|---|---|
| `docker-compose.yaml` | Container definition, port mapping, and network membership |
| `data/settings.js` | Node-RED runtime configuration (port, security, flow file, etc.) |
| `data/flows.json` | All Node-RED flow definitions (source of truth for the API) |
| `data/flows_cred.json` | Encrypted credentials used by flows (do **not** commit plaintext secrets) |
| `data/package.json` | Node-RED project metadata and custom node dependencies |
| `.env.example` | Environment variable template (copy to `.env` before deployment) |

### Key settings (`data/settings.js`)

- **Port**: `1880` (overridable via the `PORT` environment variable)
- **Flow file**: `flows.json`
- **Credential encryption**: `credentialSecret` is set via `NODE_RED_CREDENTIAL_SECRET` env var with a dev default
- **Editor auth**: `adminAuth` is enabled — login required to access the Node-RED editor
- **API auth**: all REST endpoints are gated by `httpNodeMiddleware` — when `API_KEY` is set, requests require the `X-API-Key` header

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TZ` | `Europe/Amsterdam` | Container timezone |
| `ALFRESCO_USERNAME` | `admin` | Alfresco credentials (used when frontend does not forward a user ticket) |
| `ALFRESCO_PASSWORD` | `admin` | Alfresco credentials |
| `API_KEY` | *(unset)* | Shared secret for REST endpoint protection; unset = no auth (dev mode) |
| `ADMIN_USERNAME` | `admin` | Node-RED editor login username |
| `ADMIN_PASSWORD_HASH` | *(bcrypt hash)* | Node-RED editor login password (bcrypt hash) |
| `NODE_RED_CREDENTIAL_SECRET` | `a-secret-key` | Encryption key for flow credentials — change in production |

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
| `GET` | `/inspectionPlan` | Generate an inspection plan; after successful generation, transitions AtroCore inspection status to `Planned` |
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

## Project Structure

```
node-red/
├── docker-compose.yaml       # Docker service definition
├── data/                     # Mounted into the container as /data
│   ├── flows.json            # All Node-RED flow definitions
│   ├── flows_cred.json       # Encrypted flow credentials
│   ├── package.json          # Project metadata / custom node deps
│   ├── settings.js           # Node-RED runtime configuration
│   └── lib/
│       └── flows/            # (reserved for reusable sub-flow libraries)
└── scripts/                  # Validation and smoke tooling (run on the host, not in the container)
    ├── validate-flows.mjs        # Structural flow validation (CI)
    ├── verify-endpoints.mjs      # README endpoint manifest check (CI)
    ├── smoke-flows.mjs           # Read-only live smoke harness (local)
    └── audit-error-envelope.mjs  # Error-response audit / envelope gate (local)
```

---

## Security Notes

- **`adminAuth` is enabled** — the Node-RED editor requires login (username/password from `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` env vars).
- **API key protection**: when `API_KEY` env var is set, every REST endpoint requires the `X-API-Key` header.
- **`credentialSecret`** is managed via `NODE_RED_CREDENTIAL_SECRET` env var — set a unique value in production.
- **Alfresco credentials** are read from `ALFRESCO_USERNAME`/`ALFRESCO_PASSWORD` env vars. Frontend apps can forward user-specific Alfresco tickets via the `X-Alfresco-Ticket` header, which the auth flow will use preferentially over env var credentials.
- **`.gitignore`** excludes backup files (`.backup`), runtime configs (`.config.*.json`), and `node_modules/`.
- Consider placing Node-RED behind a reverse proxy (e.g., nginx) with TLS for production deployments.
