# Contributing Guide

Thank you for contributing to **Compliance Flow**. Contributions of all sizes are welcome — documentation, bug fixes, refactors, tests, and new features.

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating.

---

## 1. Branch workflow

This repository follows a **main / develop** model:

- `main` — stable and production-ready.
- `develop` — active integration branch. **All merge requests target `develop`** unless maintainers specify otherwise.
- `feature/*` — new features, for example `feature/add-logging-module`.
- `fix/*` — bug fixes, for example `fix/ui-freeze`.
- `hotfix/*` — urgent fixes to `main`, for example `hotfix/crash-fix`.

### Example workflow

```bash
# 1. Start from develop and pull the latest changes
git checkout develop
git pull

# 2. Create a branch from develop
git checkout -b feature/awesome-improvement

# 3. Commit with Conventional Commits
git add .
git commit -m "feat: add awesome improvement"

# 4. Push the branch
git push origin feature/awesome-improvement
```

Then open a merge request targeting `develop`.

> Never commit directly to `develop` or `main`.

---

## 2. Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message.

| Type | When to use | Example |
|---|---|---|
| `feat:` | A new feature | `feat: add awesome improvement` |
| `fix:` | A bug fix | `fix: correct null handling` |
| `chore:` | Maintenance, tooling, or dependency updates | `chore: update dependencies` |
| `docs:` | Documentation-only changes | `docs: clarify setup instructions` |
| `test:` | Tests added or updated | `test: add unit test for new behavior` |
| `refactor:` | Internal change with no behavior change | `refactor: simplify initialization` |

Write meaningful messages:

- Good: `fix: correct null handling in diagnostics route`
- Poor: `update stuff`

---

## 3. Code style and tooling

These principles apply to every repository in this platform:

- Follow the conventions of the files you touch; keep diffs focused and readable.
- Avoid unrelated reformatting or refactoring in the same merge request.
- Update documentation when behavior, contracts, or configuration change.
- Add or update tests when changing logic.
- Never commit secrets, tokens, credentials, or private keys.
- Do not commit generated artifacts or local environment directories (`node_modules/`, `venv/`, `dist/`, database dumps, editor backups).

### Repository-specific tooling

- The service logic **is** the flow definition. Maintain it as one file per tab/subflow under `flows/` — edit through the Node-RED editor at `http://localhost:1880` (login required) and run `node scripts/split-flows.mjs`, or edit `flows/*.json` directly and run `node scripts/assemble-flows.mjs`. `data/flows.json` is the assembled runtime file; commit it alongside `flows/` and let the `validate:flows` job prove the two agree. See README, "Flow file layout".
- Prefer reusable **subflows** over copy-pasted function nodes, and keep each function node small and single-purpose.
- Give every `http in` endpoint a matching `catch` handler that returns a consistent error envelope with an explicit 4xx/5xx status.
- Never commit `data/flows_cred.json`, `.env`, `data/.sessions.json`, or any other credential or session material. Flow credential encryption uses `NODE_RED_CREDENTIAL_SECRET`; keep real values out of the repository.
- Remove active `debug` nodes before committing, or set `active: false` on any you intentionally leave in place.
- Keep `README.md`'s endpoint table in sync with the actual `http in` routes when you add, rename, or remove an endpoint.

---

## 4. Testing

Run the relevant checks locally before opening a merge request, and include the exact commands and their outcomes in the merge request description.

### Repository-specific checks

The `validate:flows` CI job runs without a stack; run the same commands locally before opening a merge request:

```bash
# 1. Flow-file layout: fragments, the runtime file and their round trip
node --test scripts/flows-files.test.mjs
node scripts/assemble-flows.mjs --check
node scripts/split-flows.mjs --check

# 2. Flow structure, endpoint manifest and embedded function logic
node scripts/validate-flows.mjs
node scripts/verify-endpoints.mjs
node scripts/verify-flow-logic.mjs
```

Then start the stack and exercise the flow for real:

```bash
docker compose up -d                       # shared Docker networks must already exist
node scripts/smoke-flows.mjs               # read-only endpoint smoke test
node scripts/audit-error-envelope.mjs      # error-response shapes
```

Include the endpoints you exercised and their responses in the merge request description. If you add a test harness or flow-validation script, document how to run it here.

---

## 5. Merge request checklist

Include the following in your merge request description:

- **Summary** — what changed and why.
- **Type** — `feat`, `fix`, `docs`, `refactor`, `test`, or `chore`.
- **Testing** — exact commands run and their outcomes.
- **Scope** — affected modules, APIs, contracts, and documentation.

Checklist:

- [ ] My change follows this repository's style and tooling rules.
- [ ] I performed a self-review before requesting review.
- [ ] I updated or added documentation where needed.
- [ ] Relevant tests and checks pass locally.
- [ ] My commit messages follow Conventional Commits.
- [ ] I did not commit secrets, credentials, or generated artifacts.

---

## 6. Documentation and compatibility

- Update the README, `docs/`, and `example/` payloads whenever a contract changes — API routes, payload fields, schemas, document ID formats, or Alfresco folder paths.
- Keep identifiers and payload aliases backward compatible where practical, and call out breaking changes explicitly in the merge request.
- When a change spans more than one repository in this platform, open one merge request per repository and link them to each other.

---

## 7. Security and secrets

- Never commit secrets, tokens, credentials, or private keys.
- Configure sensitive values through environment variables or the repository's documented secret mechanism.
- Call out security impact explicitly in the merge request when a change touches authentication, authorization, or data access.

---

## 8. Licensing and notices

This repository is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE).

- Do not add third-party code or assets without preserving the required license notices.
- Keep existing third-party and upstream copyright headers intact.

---

## 9. Reporting issues and proposing changes

For large or cross-cutting changes, open an issue first to align on scope and approach before implementing.

When reporting a bug, include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, runtime and tool versions)

---

## 10. Versioning and releases

Every repository in this platform versions and tags its releases the same way.

- **Scheme — CalVer.** A release is tagged with the date of its CHANGELOG section: `YYYY-MM-DD`. A second release on the same day is `YYYY-MM-DD.2`, then `.3`, and so on. Tags are created by CI, never by hand.
- **`CHANGELOG.md` is the release trigger.** A merge to `main` that changes `CHANGELOG.md` runs the `compute_release_tag` and `create_release` jobs. A merge that does not touch `CHANGELOG.md` produces no release.
- **No release without a CHANGELOG entry.** `scripts/release-tag.sh` fails — and with it the pipeline — unless:
  - `CHANGELOG.md` carries a dated release section (`## [YYYY-MM-DD]`) as its newest release section, directly under `## [Unreleased]` when that heading is present;
  - `CHANGELOG.md` changed since the previous release tag;
  - the resulting tag is new, and is not older than the previous release tag.
- **Preparing a release:** move the `Unreleased` entries under a new dated heading (for example `## [2026-09-14]` — using the date you are releasing on), push, and merge to `main`. CI then creates the tag and the GitLab Release. Older sections written in other formats (for example `## [0.5.0] - 2026-09-06` or `## 2026-09-05 (Release 1.2.0-alpha)`) are history and are ignored by the script; semver tags such as `0.1.0` or `1.0.0-pre` are historical too and are never created again.
- **Verify locally:**
  ```bash
  sh scripts/release-tag.sh            # prints the tag it would create, or fails with the reason
  sh scripts/release-tag.test.sh       # self-test of the checks above
  ```
- `scripts/release-tag.sh` and `scripts/release-tag.test.sh` are **byte-identical in every repository in this platform**. If you change one, change all six.
