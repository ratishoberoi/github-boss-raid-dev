# Audit Report

Generated: 2026-05-24T17:33:00Z

## Scope

Reviewed README generation, GitHub workflow logic, issue template logic, JSON state management, HP calculations, boss death and respawn logic, leaderboard updates, attack history updates, SVG generation, file writes, git commits, workflow permissions, and concurrency controls.

## Findings

| Severity | Finding | Evidence | Fix Applied |
| --- | --- | --- | --- |
| High | Malformed JSON crashed render and attack processing. | Temporary-copy test with invalid `data/boss.json` exited with a JSON parse exception before fixes. | `readJson()` now recovers to defaults, and `renderAll()` persists normalized JSON back to disk. |
| High | State shape was not validated. | Temporary-copy test with object-shaped `leaderboard.json` threw `leaderboard.find is not a function`. | Added normalization for boss, leaderboard, attacks, and hall of fame before use. |
| High | Markdown table injection was possible from attacker/state values. | Temporary-copy test with `ATTACKER=$'evil\|name\n\|bad\|'` corrupted README tables before fixes. | Added username sanitization and Markdown cell escaping for README and comments. |
| Medium | Writes were not atomic. | Direct `writeFileSync()` calls wrote JSON, README, and SVG in place. | Added temp-file, fsync, and rename-based atomic writes for durable files. |
| Medium | No local file lock protected concurrent script runs. | Multiple local invocations could interleave writes outside GitHub Actions concurrency. | Added an exclusive `data/.raid.lock` around attack state mutation. |
| Medium | Workflow depended on the `gh` CLI. | `gh` is not installed in this local environment, so the old close/comment path could not be validated here. | Replaced `gh` with `scripts/comment_issue.js`, using Node 18 `fetch` and GitHub REST API. |
| Medium | Git push target was implicit. | Workflow used plain `git push`. | Push now targets `origin HEAD:${{ github.event.repository.default_branch }}` explicitly. |
| Medium | Invalid numeric boss state could render bad output. | HP fields were coerced without finite-number validation. | Added integer clamping and recomputed phase from normalized HP. |
| Medium | Issue-body parsing accepted malformed values too loosely. | Parser accepted first line after heading with little normalization. | Parser now extracts a single sanitized candidate and attack processing rejects non-whitelisted attacks without state mutation. |
| Low | Issue-form labels are not guaranteed to exist. | GitHub docs state issue form labels are only added if the label exists in the repository. | Workflow gates on form body as well as label. Remaining risk documented below. |
| Low | Long display values could overflow README/SVG presentation. | No truncation existed in SVG text fields. | Added bounded display strings and SVG truncation. |

## Fixes Applied

- Validated and normalized all JSON-backed state before use.
- Added recovery from missing or malformed JSON files.
- Added atomic writes for JSON, README, and SVG outputs.
- Added local lock file for attack mutations.
- Sanitized usernames and escaped Markdown/SVG output.
- Replaced GitHub CLI usage with a Node REST API script.
- Made git push target explicit.
- Added `scripts/validate_state.js` for repeatable local validation.
- Added `scripts/stress_test.js` for isolated attack simulations.

## Validation Performed

- `node --check` passed for all scripts.
- `node scripts/validate_state.js` passed.
- Temporary-copy malformed JSON recovery passed.
- Temporary-copy object-shaped leaderboard recovery passed.
- Temporary-copy Markdown injection attack was sanitized.
- `actionlint` 1.7.12 passed for `.github/workflows/raid-attack.yml`.
- Stress simulations passed for 10, 50, 100, and 500 attacks.

## Remaining Risks

- GitHub issue forms can be spoofed through the API. The script rejects unsupported attacks and sanitizes inputs, but a spoofed issue can still trigger a workflow run if it contains the form heading.
- GitHub-hosted runner behavior cannot be fully executed locally. Workflow syntax was validated with `actionlint`; API calls were reviewed but not sent to GitHub from this environment.
- If a human edits state files while an Action run is committing, git rebase can still fail on a real conflict. The workflow fails instead of silently overwriting.

## Sources Checked

- GitHub Actions triggering and recursive run behavior: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- GitHub Actions workflow syntax and permissions: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub issue form schema and label behavior: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema
