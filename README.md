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
- **API auth**: All 19 REST endpoints route through an API key check subflow — when `API_KEY` is set, requests require `X-API-Key` header

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

### Alfresco Integration

| Method | Path | Description |
|---|---|---|
| `GET` | `/importCanonical` | Import canonical inspection data into Alfresco; transitions AtroCore status from `Planned` to `Uploaded` |
| `GET` | `/content/lastSeq` | Get the last content sequence number from Alfresco |

### Static / Reference Data

| Method | Path | Description |
|---|---|---|
| `GET` | `/serviceAreas` | List all service areas with linked specialties |
| `GET` | `/inspectionProvider` | List per-provider inspections with provider data (filterable by `?status=`) |
| `GET` | `/siteVisits` | List site visits eligible for checklist upload |
| `GET` | `/inspector/:externalId` | Get inspector details by external ID (includes `serviceAreaId`) |
| `GET` | `/siteVisit/:inspectionId` | Get site visit details by ID or code |
| `GET` | `/assignmentGroup/:externalGroup` | Get assignment group by external group identifier |
| `GET` | `/specialties` | List all available inspection specialties |
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
| **Get atrocore auth** | Obtains and caches an authentication token for the AtroCRM API |
| **Get alfresco auth** | Obtains and caches an authentication token for the Alfresco API |
| **Get topics** | Retrieves inspection topic list |
| **Query entity** | Generic entity query against AtroCRM |
| **Update entity** | Generic entity update against AtroCRM |
| **Add entity** | Generic entity creation in AtroCRM |
| **Delete entity** | Generic entity deletion in AtroCRM |
| **Get links / Get links call** | Retrieves entity relationship links |
| **Add links** | Creates entity relationship links |
| **Delete links** | Removes entity relationship links |
| **Get Entity call** | Lower-level entity retrieval sub-flow |
| **Inspection plan** | Builds and serves an inspection plan; updates AtroCore inspection status to `Planned` |
| **import canonical to alfresco** | Exports canonical inspection records to Alfresco; queries AtroCore and transitions status from `Planned` to `Uploaded` |
| **Inspection report** | Compiles and returns a full inspection report; updates AtroCore inspection status to `Reported` |
| **Auth flows** | Shared authentication helper sub-flows |
| **Static data** | Serves reference / lookup data (inspectors, locations, specialties, groups) |
| **findings flows** | Manages open findings lifecycle |
| **follow up flows** | Manages follow-up items after inspections |

---

## Project Structure

```
node-red/
├── docker-compose.yaml       # Docker service definition
└── data/                     # Mounted into the container as /data
    ├── flows.json            # All Node-RED flow definitions
    ├── flows_cred.json       # Encrypted flow credentials
    ├── package.json          # Project metadata / custom node deps
    ├── settings.js           # Node-RED runtime configuration
    └── lib/
        └── flows/            # (reserved for reusable sub-flow libraries)
```

---

## Security Notes

- **`adminAuth` is enabled** — the Node-RED editor requires login (username/password from `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` env vars).
- **API key protection**: when `API_KEY` env var is set, all 19 REST endpoints require `X-API-Key` header.
- **`credentialSecret`** is managed via `NODE_RED_CREDENTIAL_SECRET` env var — set a unique value in production.
- **Alfresco credentials** are read from `ALFRESCO_USERNAME`/`ALFRESCO_PASSWORD` env vars. Frontend apps can forward user-specific Alfresco tickets via the `X-Alfresco-Ticket` header, which the auth flow will use preferentially over env var credentials.
- **`.gitignore`** excludes backup files (`.backup`), runtime configs (`.config.*.json`), and `node_modules/`.
- Consider placing Node-RED behind a reverse proxy (e.g., nginx) with TLS for production deployments.
