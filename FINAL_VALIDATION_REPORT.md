# Final Validation Report

Generated: 2026-05-24T17:36:00Z

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Script syntax | PASS | `node --check` passed for all scripts in `scripts/`. |
| State validation | PASS | `node scripts/validate_state.js` returned `validation ok`. |
| JSON validity | PASS | Python parsed all files in `data/*.json`. |
| SVG validity | PASS | Python `xml.etree.ElementTree` parsed `assets/boss-card.svg`. |
| Workflow YAML parse | PASS | PyYAML parsed workflow and issue template files. |
| Workflow static validation | PASS | `actionlint v1.7.12` returned no errors for `.github/workflows/raid-attack.yml`. |
| Broken paths | PASS | Workflow-managed files exist: README, boss SVG, and all JSON state files. |
| Workflow loop risk | PASS | Workflow has no `push` trigger. The only trigger is opened issues. |
| GitHub CLI dependency | PASS | Workflow no longer calls `gh issue`; issue comment/close is handled by `scripts/comment_issue.js`. |
| Stress tests | PASS | `STRESS_TEST_REPORT.md` shows passing runs for 10, 50, 100, and 500 attacks. |
| Runtime artifact cleanup | PASS | No `.raid.lock`, `*.tmp`, `attack_result.md`, or `attack_result.json` files were present after validation. |
| Git working tree | NOT CLEAN | Expected deliverables are uncommitted in the working tree. No commit was requested or created. |

## Workflow Summary

- Trigger: `issues.opened`
- Permissions: `contents: write`, `issues: write`
- Concurrency group: `github-boss-raid`
- Commit target: `origin HEAD:${{ github.event.repository.default_branch }}`
- Loop prevention: no `push` trigger is defined.

## Remaining Manual GitHub Checks

- Run one real attack issue in GitHub after pushing these files to confirm repository settings allow `GITHUB_TOKEN` to push to the default branch.
- Confirm branch protection, if enabled, allows the GitHub Actions bot to update README and data files.
- Confirm the `raid-attack` label exists if label display is desired; the workflow also gates on the issue form body.
