# Release Notes - 0.1.0

Release date: 2026-05-23  
Status: Development release (not deployed to production)

## Overview
Version 0.1.0 is the first structured pre-production release of the Node-RED Compliance Inspection API. This release establishes the end-to-end integration baseline between the checklist application, AtroCRM/AtroCore, and Alfresco.

It introduces core inspection workflows, follow-up and findings management capabilities, static reference endpoints, and improved project documentation.

## Highlights
- Added inspection report generation flow.
- Added Alfresco integration calls for inspection plan, inspection report, and canonical import.
- Added authorization and lookup endpoints for inspectors, inspections, and assignment groups.
- Added static data flows for specialties and locations.
- Added findings and follow-up flow support, including follow-up sequencing.
- Added risk level information in checklist items and non-conformities.

## Improvements and Fixes
- Fixed normativa multiplicity handling so normativa is returned as a single object per protocol question.
- Improved checklist export by adding item codes for more user-friendly records in Alfresco.
- Extended checklist payload with `specialtyId` and `icaoCode` fields.
- Corrected follow-up import HTTP call behavior.
- Normalized naming in follow-up context from `icaoCode` to `locationCode`.

## Documentation and Governance
- Added comprehensive project documentation in README.
- Added Apache-2.0 license file.
- Added NOTICE attribution and ICAO content disclaimer.

## Cleanup
- Removed example seed file `checklist.json`.
- Added repository hygiene/runtime artifacts: `.gitignore` and `data/package-lock.json`.

## Release Scope Summary
- Compare range: `main..develop`
- Total commits: 17
- Files changed: 14
- Diff size: 6074 insertions, 218 deletions

## API Surface Added or Expanded
- `GET /inspectionReport`
- `GET /inspectionPlan`
- `GET /importCanonical`
- `POST /importFollowUps`
- `GET /inspector/:externalId`
- `GET /inspection/:inspectionId`
- `GET /assignmentGroup/:externalGroup`
- `GET /specialties`
- `GET /location`
- `GET /findings/open`

## Known Issues
- No known issues identified for this release.

## Upgrade and Deployment Notes
- No production rollout is planned for this version.
- For local setup and runtime instructions, refer to README.

## Notes for Stakeholders
This version is intended to validate integration behavior and workflow coverage before production hardening. The release provides a stable baseline for further testing in development and staging environments.
