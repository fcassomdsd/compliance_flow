/**
 * Unit tests for data/secrets.js — the gateway's secret resolution.
 *
 * These matter more than most: the resolver decides whether the single
 * chokepoint for all entity CRUD is authenticated, and its failure modes are
 * deliberately loud. Run with `node --test scripts/secrets.test.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const secrets = require("../data/secrets.js");

/** A throwaway directory that looks like a Docker secret mount. */
function makeSecretDir(entries = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-secrets-"));
  for (const [name, value] of Object.entries(entries)) {
    fs.writeFileSync(path.join(dir, name), value);
  }
  return dir;
}

/** A file holding one secret value. */
function makeSecretFile(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-secret-file-"));
  const file = path.join(dir, "value");
  fs.writeFileSync(file, value);
  return file;
}

/** A secret dir that exists but is empty, so nothing resolves from a mount. */
const emptyDir = () => makeSecretDir();

test("resolveSecret prefers <NAME>_FILE over the environment", () => {
  const file = makeSecretFile("from-the-file\n");
  const value = secrets.resolveSecret("API_KEY", {
    env: { API_KEY_FILE: file, API_KEY: "from-the-environment" },
    secretDir: emptyDir(),
  });
  assert.equal(value, "from-the-file", "the file wins, and is trimmed");
});

test("resolveSecret throws when <NAME>_FILE is set but missing — it does not fall back", () => {
  // This is the deliberate divergence from compliance_import's resolver.
  // Falling back here would let a failed rotation look like a successful one.
  assert.throws(
    () =>
      secrets.resolveSecret("API_KEY", {
        env: { API_KEY_FILE: "/nonexistent/path", API_KEY: "stale-but-present" },
        secretDir: emptyDir(),
      }),
    /missing or empty.*Not falling back/s,
  );
});

test("resolveSecret throws when <NAME>_FILE points at an empty file", () => {
  const file = makeSecretFile("   \n  ");
  assert.throws(
    () => secrets.resolveSecret("API_KEY", { env: { API_KEY_FILE: file }, secretDir: emptyDir() }),
    /missing or empty/,
  );
});

test("resolveSecret falls back to a Docker secret when no <NAME>_FILE is set", () => {
  const dir = makeSecretDir({ api_key: "from-the-mount\n" });
  const value = secrets.resolveSecret("API_KEY", {
    env: { API_KEY: "from-the-environment" },
    secretDir: dir,
  });
  assert.equal(value, "from-the-mount", "the mount outranks the plain env var");
});

test("resolveSecret falls back to the plain environment variable last", () => {
  const value = secrets.resolveSecret("API_KEY", {
    env: { API_KEY: "from-the-environment" },
    secretDir: emptyDir(),
  });
  assert.equal(value, "from-the-environment");
});

test("resolveSecret returns null when no source provides the value", () => {
  assert.equal(secrets.resolveSecret("API_KEY", { env: {}, secretDir: emptyDir() }), null);
});

test("applySecrets writes resolved values back into the environment", () => {
  // The flows read env.get(...) -> process.env, not settings.js. Without the
  // write-back a file-sourced credential never reaches the nodes that use it.
  const dir = makeSecretDir({ alfresco_password: "mounted-password" });
  const env = { API_KEY: "k" };
  const resolved = secrets.applySecrets({ env, secretDir: dir });

  assert.equal(resolved.ALFRESCO_PASSWORD, "mounted-password");
  assert.equal(env.ALFRESCO_PASSWORD, "mounted-password", "written back for the flows");
  assert.equal(env.API_KEY, "k", "an already-present value survives");
  assert.ok(!("ATROCORE_PASSWORD" in env), "unresolved secrets are not written as undefined");
});

test("assertProductionSecrets rejects a configuration with missing secrets", () => {
  const resolved = Object.fromEntries(secrets.SECRET_NAMES.map((n) => [n, "real-value"]));
  delete resolved.API_KEY;
  resolved.API_KEY = null;
  assert.throws(() => secrets.assertProductionSecrets(resolved), /requires these secrets.*API_KEY/s);
});

test("assertProductionSecrets rejects the placeholder shipped in .env.example", () => {
  // The exact string committed to this repository. If .env.example's value ever
  // changes, this test should fail until PUBLIC_PLACEHOLDERS is updated too.
  const shipped = "demo-only-CHANGE-BEFORE-ANY-PUBLIC-DEPLOYMENT";
  assert.ok(
    secrets.PUBLIC_PLACEHOLDERS.includes(shipped),
    "the committed placeholder must be on the rejection list",
  );

  const resolved = Object.fromEntries(secrets.SECRET_NAMES.map((n) => [n, "real-value"]));
  resolved.API_KEY = shipped;
  assert.throws(
    () => secrets.assertProductionSecrets(resolved),
    /published in this repository.*API_KEY/s,
  );
});

test("assertProductionSecrets rejects every known public placeholder", () => {
  for (const placeholder of secrets.PUBLIC_PLACEHOLDERS) {
    const resolved = Object.fromEntries(secrets.SECRET_NAMES.map((n) => [n, "real-value"]));
    resolved.ALFRESCO_PASSWORD = placeholder;
    assert.throws(
      () => secrets.assertProductionSecrets(resolved),
      /published in this repository/,
      `expected ${JSON.stringify(placeholder)} to be refused`,
    );
  }
});

test("assertProductionSecrets accepts a fully-configured production setup", () => {
  const resolved = Object.fromEntries(
    secrets.SECRET_NAMES.map((n) => [n, `generated-${n.toLowerCase()}-value`]),
  );
  assert.doesNotThrow(() => secrets.assertProductionSecrets(resolved));
});

test("the placeholder committed to .env.example is still the one we reject", () => {
  // Guards against .env.example and the rejection list drifting apart, which
  // would silently re-open the gateway to a value everyone already knows.
  const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const match = envExample.match(/^API_KEY=(.+)$/m);
  assert.ok(match, ".env.example must define API_KEY");
  assert.ok(
    secrets.PUBLIC_PLACEHOLDERS.includes(match[1].trim()),
    `.env.example ships API_KEY=${match[1].trim()}, which is not on the rejection list`,
  );
});
