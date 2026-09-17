# Third-party licenses

This repository is licensed under Apache License 2.0 for original project code and documentation (the flow logic in `data/flows.json`/`flows/`, the smoke/validation scripts, and this repository's own files).

Runtime dependencies and container images used by this project are provided by third parties and remain under their respective licenses and terms.

## Container image

| Image | Upstream project/vendor | License source |
|---|---|---|
| nodered/node-red:4.1.10 | OpenJS Foundation (Node-RED) | Apache License 2.0 — https://github.com/node-red/node-red/blob/master/LICENSE |

This project uses the official Node-RED image unmodified — no `Dockerfile`, no extra community nodes installed (`data/package.json` declares no dependencies). The image itself bundles Node.js and Node-RED's own dependency tree, which is not re-scanned here; see the upstream image/project's own license notices for that tree.

## How to maintain this file

1. Add new third-party libraries, images, or community Node-RED nodes when introduced (a dependency added to `data/package.json` would need its own license check).
2. Record version numbers used in this repository.
3. Link to the canonical license source where possible.
4. Preserve required attribution and notice text when redistributing.

## Important note

This file is an operational tracking document, not legal advice.
For commercial redistribution or productization, perform a legal review of all third-party license obligations.
