# Merge Request: release/2026.05.17-main-sync -> main

## Purpose
Merge all changes currently in `develop` into `main` using a release branch aligned with Gitflow.

## Scope
- Source compare: `main..develop`
- Commits included: 17
- Files changed: 14
- Diff size: 6074 insertions, 218 deletions

## Key Changes

### New Capabilities
- Inspection report generation flow.
- Alfresco backend integrations for inspection plan/report and canonical import.
- Authorization flows for inspector, inspection, and assignment group lookups.
- Static data flows for specialties and locations.
- Findings flow for open findings by location/specialty.
- Follow-up flows, including follow-up sequence.
- Risk level support in checklist items and non-conformities.

### Fixes and Improvements
- Normativa multiplicity fixed (single object per protocol question).
- Checklist export includes item code for better readability in Alfresco records.
- Checklist fields expanded (`specialtyId`, `icaoCode`).
- Follow-up HTTP import call corrected.
- Naming normalization from `icaoCode` to `locationCode` in follow-up context.

### Documentation and Governance
- Added comprehensive `README.md`.
- Added Apache-2.0 `LICENSE`.
- Added `NOTICE` attribution/disclaimer file.

### Cleanup
- Removed example seed file `checklist.json`.
- Added `.gitignore` and `data/package-lock.json`.

## Files with Highest Impact
- `data/flows.json`
- `data/flows_cred.json`
- `docker-compose.yaml`
- `README.md`

## Risk Assessment
- **Medium**: substantial changes to Node-RED flow definitions and integration paths.
- Main risk areas: endpoint contract compatibility and Alfresco webscript connectivity.

## Validation Checklist
- [ ] Node-RED boots correctly from `docker-compose.yaml`.
- [ ] Core endpoints return expected payload contracts.
- [ ] Follow-up flows execute end-to-end.
- [ ] Alfresco calls succeed in target environment.
- [ ] Changelog reviewed and approved.

## Release Notes
See `CHANGELOG.md` in this branch for full commit-level release notes.

## Gitflow Note
After merging this MR into `main`, merge the same release branch back into `develop` (or ensure fast-forward equivalence) so both branches remain synchronized.
