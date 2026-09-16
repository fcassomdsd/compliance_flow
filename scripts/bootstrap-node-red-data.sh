#!/usr/bin/env bash
#
# bootstrap-node-red-data.sh — make the Node-RED data directory writable before the first start.
#
# Node-RED runs as uid/gid 1000 (`node-red`) and writes into `/data/…` — `node_modules` at
# startup, plus its runtime files (`.config.runtime.json`, `.sessions.json`, `flows_cred.json`).
# That directory is a **bind mount** of this repository's tracked `data/`, so its ownership is the
# host's. On a developer's machine the host uid usually *is* 1000 and everything works by
# accident; anywhere else — CI, a server, another workstation — the container cannot create
# `node_modules` and exits during start-up:
#
#   [error] Failed to start server:
#   [error] Error: EACCES: permission denied, mkdir '/data/node_modules'
#
# The container then shows as `Exited (0)` and the port never answers, which looks like a slow
# start rather than a permission problem.
#
# Idempotent. As root the directory is chowned to the container's user; otherwise it is made
# world-writable. Only the *directory*'s mode is touched when not running as root, so the tracked
# files keep their git modes.
#
# Usage: ./scripts/bootstrap-node-red-data.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${REPO_DIR}/data"
NODE_RED_UID=1000
NODE_RED_GID=1000

[[ -d "${DATA_DIR}" ]] || {
  echo "bootstrap-node-red-data: ${DATA_DIR} is missing — is this a full checkout?" >&2
  exit 1
}

if [[ "$(id -u)" == "0" ]]; then
  chown -R "${NODE_RED_UID}:${NODE_RED_GID}" "${DATA_DIR}"
  echo "bootstrap-node-red-data: ${DATA_DIR} owned by ${NODE_RED_UID}:${NODE_RED_GID}"
else
  chmod 0777 "${DATA_DIR}"
  echo "bootstrap-node-red-data: ${DATA_DIR} is world-writable (rerun as root to chown ${NODE_RED_UID}:${NODE_RED_GID})"
fi
