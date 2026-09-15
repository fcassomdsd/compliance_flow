# Changelog

All notable changes are documented in this file.

## [Unreleased]

### Changed

- **Versioning and tagging standardised across the platform.** Releases are tagged `YYYY-MM-DD` (CalVer) after the date of the newest `## [YYYY-MM-DD]` CHANGELOG section, with `YYYY-MM-DD.2` for a second release on the same day. The release jobs now run `scripts/release-tag.sh`, which fails when that section is missing, when `CHANGELOG.md` is unchanged since the previous release, or when the tag already exists; `scripts/release-tag.test.sh` is its self-test. See CONTRIBUTING.md, "Versioning and releases".
- **README endpoint manifest now CI-checked.** `scripts/verify-endpoints.mjs` (run by the `validate:flows` job) fails when the README's API Reference table and `data/flows.json`'s `http in` nodes drift. Fixed the drift it found: removed the duplicate `/importCanonical` row, removed the non-existent `GET /siteVisit/:inspectionId`, and documented `GET /providers` and `GET /inspection/:inspectionId`.
- **Added a read-only smoke harness.** `scripts/smoke-flows.mjs` exercises the safe HTTP endpoints against a running stack (15 read-only checks: list endpoints, parametrised lookups, `POST /queryEntity`) and documents the 9 destructive endpoints as skipped rather than failed. It is the regression net for the P2.1 `flows.json` restructuring. See README "Smoke testing".
- **Added an error-envelope audit.** `scripts/audit-error-envelope.mjs` records the current (inconsistent) error responses — several endpoints return HTTP 200 with a raw error string or an empty body because the `http request` nodes do not throw on upstream failure — and, with `--enforce`, becomes the gate for the P2.1 "one error envelope" step. See README "Error-envelope audit".
- **Extracted reusable subflows from the heavily reused `link call` chains.** `getAtrocoreTicket`, `getAlfrescoTicket`, `queryEntity`, `getEntityLinks` and `updateEntity` are now Subflows, instantiated wherever needed; `queryEntity`/`getEntityLinks`/`updateEntity` compose `getAtrocoreTicket` internally. This cut `link call` nodes from 67 to 11. No function, request, or endpoint definition changed.
- **Removed the dead wrappers left by the subflow extraction.** Deleted the four orphaned `link in`/`link out` wrapper tabs (`Get atrocore auth`, `Get Entity call`, `Get links call`, `get alfresco auth`) and the pre-existing unreachable `Get topics` tab (29 nodes, 5 tabs), and restored the `Static data` tab's `catch → http response(400)` error path that the refactor had dropped — with AtroCore unavailable, `/specialties` now fails fast with 400 instead of hanging. README's flow list now documents the 15 remaining tabs and the 5 subflows.
- **Error responses normalised to one envelope.** Errors now return `4xx/5xx` with `{ "success": false, "error": "<message>" }`; success payloads are unchanged (so no consumer in `compliance_web`/`compliance_checklist` is affected). This replaced the `catch → http response(304)` paths (now `500` with the envelope), routed upstream failures to the error path with a new "check upstream status" function after every `http request` (AtroCore answers unknown entities with **HTTP 404**, which the hardcoded `200` response nodes had been masking), and enveloped the one flow-level validation error (`/inspectors` without `specialty`). `GET /inspector/:externalId` now returns **404 + envelope** for an unknown id instead of `200` with nulls — the only consumer (`authStore.refreshDomainContext`) already treats that lookup as optional behind a `try/catch`. `scripts/audit-error-envelope.mjs --enforce` passes 5/5 and the smoke harness stays 15/15.
- **Upstream endpoints, timeouts and retries are now deployment settings.** Every `http request` URL is env-driven: a `set env config` function node before each request resolves `ATROCORE_BASE_URL` / `ALFRESCO_BASE_URL` (defaults unchanged: `http://atro-web/api/v1`, `http://proxy:8080/alfresco`) and an optional `HTTP_REQUEST_TIMEOUT_MS`. The base URLs must be **msg** properties referenced with triple braces (`{{{atrocoreBaseUrl}}}`) because the `http request` node renders its URL with `mustache.render(url, msg)` and mustache HTML-escapes `{{ }}` values — `{{atrocoreBaseUrl}}` turns `http://` into `http:&#x2F;&#x2F;`. The five shared subflow calls (`getAtrocoreTicket`, `getAlfrescoTicket`, `queryEntity`, `getEntityLinks`, `updateEntity`) now retry **upstream 5xx** a bounded number of times with linear backoff (`HTTP_MAX_RETRIES`, `HTTP_RETRY_BACKOFF_MS`), via a retry branch on their status check plus a `delay` node. `senderr: true` was set on those five requests so transport failures go only to the catch handler: with the default `senderr: false` the error reached *both* the catch (which responded immediately) and the retry branch, producing duplicate responses (`ERR_HTTP_HEADERS_SENT`, "Message exceeded maximum number of catches"). Transport-level failures therefore surface immediately rather than being retried — only upstream 5xx is retried. New env vars are documented in the README, `.env.example` and `docker-compose.yaml`.
- **Added `scripts/verify-flow-logic.mjs` to the CI validate job.** It evaluates the JavaScript embedded in the function nodes with stubbed `env`/`node` (no stack needed) and asserts the error envelope shapes, the env plumbing (defaults and overrides) and the retry policy (2xx/304 pass through, 4xx errors immediately, 5xx retries with backoff, the limit and backoff are configurable) — 49 checks.
- **The flow is now maintained as one file per tab and per subflow.** Node-RED loads a single flow file — its Projects feature does not split a flow per tab, and it is disabled here anyway — so `data/flows.json` remains the runtime artifact, but it is now the concatenation, in filename order, of 20 files under `flows/`: `01-getchecklistquestion.json` … `15-follow-up-flows.json`, plus one `subflow-*.json` per subflow. `scripts/split-flows.mjs` writes the fragments (and re-canonicalises `data/flows.json`, which the editor otherwise leaves with new nodes appended at the end); `scripts/assemble-flows.mjs` rebuilds the runtime file from them. The `validate:flows` job runs both `--check` modes and `scripts/flows-files.test.mjs` (9 round-trip and failure-mode tests), so the two sides cannot drift apart. No node, wire, endpoint or function changed: this re-lays out the same 403 nodes, and `data/flows.json` is reordered into tab blocks as a one-off.

### Fixed

- **`/inspectionPlan` and `/inspectionReport` hung forever instead of answering.** Both tabs' `catch` nodes were the only disabled nodes in the whole flow (`"d": true`, present 15+ commits back), and Node-RED reports an error only when *no* catch node handles it — so every failure in those two tabs was dropped and the HTTP request was never answered. The two error paths built for the P2.1 envelope work (`catch → error envelope → http response(400)`) were dead code. Both catches are enabled, and `scripts/validate-flows.mjs` now fails CI on a disabled `catch` node, since this failure mode is silent by construction.
- **The two status transitions updated the wrong entity, failing every call with HTTP 404.** A blanket "rename Inspection entity references to SiteVisit" commit (`cfc7fe3`) rewrote the *entity* in `set parameteros for status to Planned` and `update AtroCore status to Reported` while leaving `msg.entityId = inspectionId` alone, so `/inspectionPlan` and `/inspectionReport` tried `PUT /api/v1/SiteVisit/<inspection id>` — a SiteVisit that does not exist. Both are back to `msg.entity = "Inspection"`, matching the documented per-provider status model (the Inspection's status is what moves `→ Planned` / `→ Reported`, not the SiteVisit's). `scripts/verify-flow-logic.mjs` now asserts that a node setting both `msg.entity` and `msg.entityId = <name>Id` pairs the two consistently (50 checks). The two bugs had been hiding each other: the disabled catch meant the 404 was never returned, so the endpoint simply hung. Verified live: `GET /inspectionPlan?siteVisit=V-MDPP-2025-01&provider=…` now returns **200** and moves the Inspection `Assigned → Planned`, and the generated plan PDF renders the `Entity(ies) to be Inspected` and `Team Members` blocks.

## [2026-09-06]

### Added
- **`/activityTypes` endpoint**: Returns the Nomenclatura oversight-activity-type catalog (`id`/`code`/`name`, e.g. `A`/`Auditoría`), mirroring the `/location` route pattern.
- **`locale` parameter on `/inspectionPlan` and `/inspectionReport`**: forwarded (default `es`) into the payload posted to the Alfresco report-generation webscripts, so a caller's UI locale reaches the generated document. Completes the localization work landing in `compliance_web` and `compliance_cmis` in the same change set.

### Changed
- **Inspection Report**: `inspectionType` field replaced with `activityTypeId`/`activityTypeCode`/`activityTypeName`, matching the Inspection entity's new `ActivityType` link (was a free-text field). Supersedes the `inspectionType` field added in `[0.4.0]` below.
- **`/inspectionPlan` and `/inspectionReport`**: now overwrite the plan/report identifier with the per-provider Inspection's own Activity code after resolving it, instead of leaving it as the SiteVisit code captured earlier in the flow. Activity codes are independently sequenced from their parent SiteVisit's code as of this change (a sibling `compliance_web` refactor), so the two are no longer interchangeable — generated plan/report documents were being named after the site visit.
- **`/checklist`**: now queries the Inspection record directly (using the `inspectionId` already passed in the request) for the `inspection` code field returned to the checklist app, instead of reusing the parent SiteVisit's code.
- **`/inspectionReport`**'s Inspection lookup ("set inspection params") no longer filters by a captured SiteVisit-code variable alongside `inspectedProviderId` — that filter could never match once Activity/SiteVisit codes were decoupled, so report generation was failing outright for every request.

### Fixed
- **Alfresco ticket authentication**: the shared auth subflow (used by `/findings/open`, canonical-import triggers, and inspection plan/report generation) built an invalid Basic-auth header when logging in fresh rather than forwarding a caller's ticket (missing the required trailing colon), and separately, the legacy Alfresco webscript runtime backing these routes needs the ticket passed as an `alf_ticket` query parameter rather than a Basic-auth header. Both fixed.

## [0.4.0] - 2026-08-02

### Added
- **`/serviceAreas` endpoint**: Returns all service areas with linked specialties from AtroCore.
- **`/inspectionProvider` endpoint**: Returns per-provider Inspection records with `inspectionId`, `inspectedProviderId`, `siteVisitId`, `code`, `status`, `serviceProviderName`. Filterable by status parameter. Used by checklist app for import provider selection.
- **`/siteVisits` endpoint**: Returns site visits with upload-eligible status (Planned/Uploaded/Reported/Complete).
- **Per-provider Inspection queries**: Inspection report flow now queries `InspectedProvider` by `siteVisitId`+`serviceProviderId`, then queries `Inspection` by `inspectedProviderId`. Resolves ambiguity of shared inspection codes.
- **Service area scoping on inspector profile**: `/inspector/:externalId` now includes `serviceAreaId` and `serviceAreaName` for planner authorization scoping.

### Changed
- **Inspection → SiteVisit rename**: All entity queries in function nodes changed from `"Inspection"` to `"SiteVisit"`. `/inspection/:inspectionId` route renamed to `/siteVisit/:inspectionId`.
- **URL parameter renames**: Inspection plan/report flows capture `req.query.siteVisit` instead of `req.query.inspection`. Frontend API calls aligned (`?siteVisit=` instead of `?inspection=`).
- **Inspection Plan provider filter**: `/inspectionPlan` accepts `provider` parameter (was `serviceArea`). Filters by `inspectedProviderId` for per-provider plan generation.
- **Inspection Report enhanced**: Flow now includes `objective`, `scope`, `inspectionType`, `description`, `conclusion` from per-provider Inspection entity in report JSON. `email` field added to person query for future email delivery.
- **Status transitions updated**: `/inspectionPlan`, `/importCanonical`, `/inspectionReport` status update flows now reference `SiteVisit` entity (was `Inspection`).

### Fixed
- Fixed `/inspectionReport` using `req.query.siteVisit` (was `req.query.inspection` after rename).
- Fixed inspection plan `serviceArea` filter removed in favor of `inspectedProviderId`.

## [0.3.0] - 2026-07-30

### Added
- Status transition sub-flows in 3 endpoints:
  - `/inspectionPlan` — after Alfresco plan generation, updates AtroCore inspection status to `Planned`
  - `/importCanonical` — after canonical import, queries AtroCore by inspection code and, if status is `Planned`, transitions to `Uploaded`
  - `/inspectionReport` — after report generation, updates AtroCore inspection status to `Reported`
- Each status update flow includes AtroCore auth, HTTP request, and fire-and-forget pattern (response not blocked by status update)

## [0.2.0] - 2026-08-01

### Security
- Removed hardcoded Alfresco admin/admin credentials — now read from `ALFRESCO_USERNAME`/`ALFRESCO_PASSWORD` env vars
- Removed hardcoded AtroCore auth — now read from `ATROCORE_USERNAME`/`ATROCORE_PASSWORD` env vars
- `adminAuth` enabled for Node-RED editor (username/password from env vars)
- `credentialSecret` set via `NODE_RED_CREDENTIAL_SECRET` env var
- Backup and runtime config files added to `.gitignore`

### Added
- `severityConfig` in checklist API response (A/B/C with daysToSolution)
- AtroCore credential function node (Basic auth header from env vars)
- Forwarded ticket support in `set payload` function (X-Alfresco-Ticket header)
- `.env.example` template with all 7 environment variables

### Fixed
- Fixed `send report` node `paytoqs` from `query` to `ignore` (JSON body instead of query params)
- Fixed AtroCore auth flow missing credentials (`authType: basic` with no credentials)
- Fixed `alfresco-net` network marked as external in docker-compose
- Fixed `get alfresco auth` flow clearing stale headers from calling flows
- Fixed docker-compose `version: "3.7"` deprecated line removed
- Fixed `nodered/node-red:latest` pinned to `4.1.10`
- Fixed unused named `data:` volume removed from docker-compose
- Fixed stale `checklist.json` reference in README

### Changed
- Alfresco hostnames standardized to `proxy:8080` across all flows
- 21 debug nodes deactivated for production (`active: false`)

## [0.1.0] - 2026-05-23

### Summary
- Release scope from `main..develop`
- Commits: 17
- Files changed: 14 (`6074 insertions`, `218 deletions`)

### Added
- Inspection report generation flow.
- Integration calls to Alfresco backend for inspection plan/report and canonical import.
- Authorization-related flows:
  - `GET /inspector/:externalId`
  - `GET /inspection/:inspectionId`
  - `GET /assignmentGroup/:externalGroup`
- Static data flows (specialties and locations).
- Findings flow for open findings by location/specialty.
- Follow-up flows (including follow-up sequence).
- Risk level fields in checklist flow (items and non-conformities).
- New project documentation files: `README.md`, `LICENSE`, `NOTICE`.
- `.gitignore` and `data/package-lock.json`.

### Changed
- Checklist export now includes item code for friendlier records in Alfresco.
- Checklist payload expanded with `specialtyId` and `icaoCode` fields.
- Follow-up import HTTP call corrected.
- Field normalization from `icaoCode` to `locationCode` in follow-up related flow.
- Updates to Node-RED data/config artifacts:
  - `data/flows.json`
  - `data/flows_cred.json`
  - `data/.flows.json.backup`
  - `data/.flows_cred.json.backup`
  - `data/.config.users.json`

### Fixed
- Normativa multiplicity: normativa is now a single object per protocol question (instead of array).

### Removed
- Removed example seed file `checklist.json`.

### Commit Log (`main..develop`)
- f42fc67 (2026-03-24): fix: normativa multiplicity - normativa is now only one per protocol question, so it is returned as an object, not an array.
- 94b71c7 (2026-03-28): fix: add item code - add item code when exporting a checklist. This to produce more user-friendly records in Alfresco
- 939197b (2026-03-28): feat: create inspection report flow Created a flow for generating an inspection report
- 02a2b6e (2026-04-01): feat/add calls to Alfresco backend - Create inspectionPlan flow with call to Alfresco webscript - Create inspectionReport flow with call to Alfresco webscript - Create importCanonical flow with call to Alfresco webscript
- 7f36483 (2026-04-04): feat: add authorization related flows - Create /inspector/:externalId flow for retrieving inspector data keyed on an external ID (e. g., Alfresco username) - Create /inspection/:inspectionId for retrieving general inspection data using inspection ID or inspection code - Create /assignmentGroup/:externalGroup for retrieving the specialties related to a given assignment group
- b1b5e61 (2026-04-07): feat: add static data flows - Add flows for obtaining static (foundational) data: specialties and locations
- a81426f (2026-04-08): fix: add fields - Added fields specialtyId and icaoCode to the checklist
- 5ff7f0d (2026-04-09): feat/add-findings-flow Added flow for obtaining open findings given location code and specialty code
- 8b454ff (2026-04-12): feat: add risk level to checklist flow - added risk levels to checklist items and non-conformities
- c9be2f0 (2026-04-18): feat: add follow up flows
- 19d1ae7 (2026-05-14): feat: add flows for follow ups - added flow for follow up sequence - corrected http call for follow up import - normalized "icaoCode" to "locationCode"
- 14e7513 (2026-05-14): Merge branch 'refactor/solution-centered-workflow' into 'develop'
- e423e11 (2026-05-16): docs: add comprehensive README with API reference and architecture
- f90c64f (2026-05-16): docs: add Apache-2.0 LICENSE
- 3c9f468 (2026-05-16): docs: add NOTICE with attribution and ICAO content disclaimer
- d1a47e6 (2026-05-16): chore: remove example checklist.json seed data
- 8b2a14c (2026-05-16): Merge branch 'chore/review-readme' into 'develop'
