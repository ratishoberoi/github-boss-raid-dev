# Reliability Report

Generated: 2026-05-24T17:33:00Z

## Improvements Implemented

| Area | Problem | Root Cause | Fix | Validation Method |
| --- | --- | --- | --- | --- |
| File locking | Concurrent local script runs could interleave state writes. | No process-level lock existed outside GitHub Actions concurrency. | Added exclusive `data/.raid.lock` during attack mutation. | Stress tests performed repeated attack writes without state corruption. |
| Atomic JSON writes | Interrupted writes could leave truncated JSON. | Files were written directly in place. | Added temp-file, fsync, rename, and best-effort directory fsync. | JSON parsed after all stress simulations. |
| Input validation | State files could contain wrong types or invalid numbers. | Load path trusted JSON shape. | Added state normalization and integer clamping. | Object-shaped leaderboard and malformed HP tests recovered. |
| Defensive error handling | Malformed state crashed rendering. | JSON parse errors propagated. | `readJson()` recovers to defaults and `renderAll()` persists normalized files. | Malformed JSON test exited 0 and rewrote valid JSON. |
| Missing files | Deleted data files would fail later operations. | Directory creation existed, but missing data was only partially handled. | Missing files now load defaults and are recreated during regeneration. | Covered by render and stress setup in temporary copies. |
| Graceful README regeneration | README generation could fail on malformed state. | Render path loaded raw state directly. | Render path uses normalized recovered state. | `node scripts/render_readme.js` and `node scripts/validate_state.js` passed. |
| Graceful SVG regeneration | SVG could render unsafe or overflowing text. | State values were inserted with minimal bounds. | SVG values are escaped and truncated. | SVG sync check and complete-root check passed. |

## Concurrency

- GitHub Actions concurrency remains configured as `github-boss-raid` with `cancel-in-progress: false`.
- Local file locking protects direct script invocation.
- Git push now targets the default branch explicitly.
- A true git conflict with a simultaneous human edit still fails the workflow instead of overwriting.

## Validation Performed

- `node scripts/validate_state.js`
- `node scripts/stress_test.js`
- Temporary-copy malformed JSON recovery
- Temporary-copy invalid leaderboard recovery
- Temporary-copy injection and long-input cases
- `actionlint` 1.7.12 on the workflow file

## Remaining Reliability Risks

- The repository can grow over time because `attacks.json` stores full attack history. The MVP requires attack history updates, and no retention policy was added.
- If GitHub API availability is degraded, the state commit may succeed while the issue comment/close step fails. The issue would remain open for manual inspection.
- If branch protection blocks GitHub Actions pushes, the workflow will fail at the commit step. This must be configured in repository settings.
