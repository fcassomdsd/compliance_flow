# Changelog

All notable changes included in this release branch are documented here.

## [Unreleased] - 2026-05-17

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
