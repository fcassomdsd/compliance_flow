/**
 * Secret resolution for the Node-RED gateway.
 *
 * Secrets resolve by precedence, mirroring compliance_import's
 * alfresco_client.py so the whole platform has one shape:
 *
 *   1. <NAME>_FILE            an explicit path to a file holding the value
 *   2. /run/secrets/<name>    a Docker/Compose secret, lowercase name
 *   3. <NAME>                 a plain environment variable
 *
 * (1) is the seam a secret manager writes into: once secrets can arrive as
 * files, adding Vault requires no change here. See "An ideal production
 * configuration.md" section 4.3 in the platform umbrella repo.
 *
 * Deliberate divergence from the Python reference: when <NAME>_FILE is set but
 * the file is missing or empty this throws, rather than falling through to the
 * environment variable. Silently falling back from a file a secret manager was
 * supposed to write, to a stale environment value, is how a rotation appears to
 * succeed and does not.
 */

var fs = require("fs");

/** Secrets the gateway cannot run without in production. */
var SECRET_NAMES = [
    "API_KEY",
    "NODE_RED_CREDENTIAL_SECRET",
    "ADMIN_PASSWORD_HASH",
    "ALFRESCO_USERNAME",
    "ALFRESCO_PASSWORD",
    "ATROCORE_USERNAME",
    "ATROCORE_PASSWORD"
];

/**
 * Values published in this repository, and therefore secret to nobody.
 *
 * These exist so that "the variable is set" cannot be mistaken for "the
 * variable is safe": a gateway shipping an API key that every reader of the
 * repository already knows is authenticated in name only.
 */
var PUBLIC_PLACEHOLDERS = [
    "demo-only-CHANGE-BEFORE-ANY-PUBLIC-DEPLOYMENT",
    "replace-me",
    "replace-with-a-bcrypt-hash",
    "a-secret-key",
    "admin",
    "password",
    "changeme",
    "change-me"
];

var DEFAULT_SECRET_DIR = "/run/secrets";

function readSecretFile(filePath) {
    try {
        var value = fs.readFileSync(filePath, "utf8").trim();
        return value || null;
    } catch (err) {
        return null;
    }
}

/**
 * Resolve one secret. Returns the value, or null when no source provides it.
 * Throws when <NAME>_FILE is set but unusable — see the note above.
 *
 * `options.secretDir` overrides the Docker secret directory, for tests.
 * `options.env` overrides the environment, for tests.
 */
function resolveSecret(name, options) {
    var opts = options || {};
    var env = opts.env || process.env;
    var secretDir = opts.secretDir || DEFAULT_SECRET_DIR;

    var explicitPath = env[name + "_FILE"];
    if (explicitPath) {
        var fromExplicit = readSecretFile(explicitPath);
        if (!fromExplicit) {
            throw new Error(
                "Refusing to start: " + name + "_FILE points at " + explicitPath +
                ", which is missing or empty. Not falling back to " + name +
                " — a silent fallback would hide a failed secret rotation."
            );
        }
        return fromExplicit;
    }

    var fromMount = readSecretFile(secretDir + "/" + name.toLowerCase());
    if (fromMount) {
        return fromMount;
    }

    return env[name] || null;
}

/**
 * Resolve every secret and write it back into the environment.
 *
 * The write-back is not incidental: the flows' function nodes read these
 * through env.get(...), which reads process.env, not through settings.js.
 * Without it a file-sourced credential would reach settings.js and never reach
 * the flows that actually use it.
 *
 * Returns a name -> value map (values may be null).
 */
function applySecrets(options) {
    var opts = options || {};
    var env = opts.env || process.env;
    var resolved = {};

    SECRET_NAMES.forEach(function (name) {
        var value = resolveSecret(name, opts);
        resolved[name] = value;
        if (value !== null) {
            env[name] = value;
        }
    });

    return resolved;
}

/**
 * Refuse an insecure production configuration. Throws on the first problem
 * found; returns silently when the configuration is acceptable.
 */
function assertProductionSecrets(resolved) {
    var missing = SECRET_NAMES.filter(function (name) {
        return !resolved[name];
    });
    if (missing.length) {
        throw new Error(
            "Refusing to start: NODE_ENV=production requires these secrets to be " +
            "set, via <NAME>_FILE, " + DEFAULT_SECRET_DIR + "/<name>, or the " +
            "environment: " + missing.join(", ")
        );
    }

    var placeholders = SECRET_NAMES.filter(function (name) {
        return PUBLIC_PLACEHOLDERS.indexOf(resolved[name]) !== -1;
    });
    if (placeholders.length) {
        throw new Error(
            "Refusing to start: these secrets still hold a value published in " +
            "this repository, which means they are not secret: " +
            placeholders.join(", ") + ". Generate real values (for example " +
            "`openssl rand -hex 32`) before running with NODE_ENV=production."
        );
    }
}

module.exports = {
    SECRET_NAMES: SECRET_NAMES,
    PUBLIC_PLACEHOLDERS: PUBLIC_PLACEHOLDERS,
    resolveSecret: resolveSecret,
    applySecrets: applySecrets,
    assertProductionSecrets: assertProductionSecrets
};
