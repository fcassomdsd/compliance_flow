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
| `checklist.json` | Seed data — inspection checklist questions for the surveillance specialty |

### Key settings (`data/settings.js`)

- **Port**: `1880` (overridable via the `PORT` environment variable)
- **Flow file**: `flows.json`
- **Credential encryption**: uses a generated key by default. Set `credentialSecret` to a fixed value in production to prevent credentials from being lost on container rebuild.
- **Authentication**: admin auth is disabled by default. Enable `adminAuth` in `settings.js` for production deployments.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TZ` | `Europe/Amsterdam` | Container timezone |
| `PORT` | `1880` | HTTP port for the Node-RED server |

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
| `GET` | `/inspectionPlan` | Retrieve an inspection plan |
| `GET` | `/inspectionReport` | Generate and retrieve an inspection report |
| `POST` | `/importFollowUps` | Import follow-up items into the system |

### Alfresco Integration

| Method | Path | Description |
|---|---|---|
| `GET` | `/importCanonical` | Import canonical inspection data into Alfresco |
| `GET` | `/content/lastSeq` | Get the last content sequence number from Alfresco |

### Static / Reference Data

| Method | Path | Description |
|---|---|---|
| `GET` | `/inspector/:externalId` | Get inspector details by external ID |
| `GET` | `/inspection/:inspectionId` | Get inspection details by inspection ID |
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
| **Inspection plan** | Builds and serves an inspection plan |
| **import canonical to alfresco** | Exports canonical inspection records to Alfresco |
| **Inspection report** | Compiles and returns a full inspection report |
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

- **Do not commit `flows_cred.json` with plaintext secrets.** Credentials are encrypted at rest by Node-RED using the `credentialSecret` value in `settings.js`.
- Enable `adminAuth` in `settings.js` before exposing the Node-RED editor to any non-local network.
- Consider placing Node-RED behind a reverse proxy (e.g., nginx) with TLS for production deployments.
