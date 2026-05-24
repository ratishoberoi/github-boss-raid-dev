# Deployment Checklist

Generated: 2026-05-24T18:20:00Z

## Repository Evidence

| Item | Result | Evidence |
| --- | --- | --- |
| Configured remote | PASS | `origin` is `git@github.com:ratishoberoi/github-boss-raid-dev.git`. |
| Local branch | PASS | Current branch is `main`. |
| SSH authentication | PASS | `ssh -T git@github.com` returned authenticated user `ratishoberoi`. |
| Remote default branch | PASS | GitHub API reports default branch `main`. |
| Repository visibility | PASS | GitHub API reports `private: false`. |
| Branch protection | PASS | GitHub API reports branch `main` has `protected: false`. |
| Local Git identity | PASS | `user.name` and `user.email` are configured locally. |
| Local GitHub token | NOT AVAILABLE | `GITHUB_TOKEN` and `GH_TOKEN` are not present in the local environment. |

## Workflow File Checks

| Item | Result | Evidence |
| --- | --- | --- |
| Workflow exists locally | PASS | `.github/workflows/raid-attack.yml` exists. |
| Workflow trigger | PASS | Workflow listens to `issues.opened`. |
| Workflow loop risk | PASS | Workflow does not listen to `push`. |
| Workflow permissions declared | PASS | `contents: write` and `issues: write` are declared. |
| Workflow concurrency | PASS | `concurrency.group` is `github-boss-raid`; `cancel-in-progress: false`. |
| Checkout branch assumption | PASS | Checkout uses `${{ github.event.repository.default_branch }}`. |
| Push target | PASS | Workflow pushes `HEAD:${{ github.event.repository.default_branch }}`. |
| Workflow syntax | PASS | `actionlint v1.7.12` returned no errors locally. |
| Workflow present on GitHub | FAIL BEFORE PUSH | GitHub API `/actions/workflows` returned `total_count: 0` before deployment. |

## Issue Form Checks

| Item | Result | Evidence |
| --- | --- | --- |
| Issue form exists locally | PASS | `.github/ISSUE_TEMPLATE/attack.yml` exists. |
| Blank issues disabled locally | PASS | `.github/ISSUE_TEMPLATE/config.yml` sets `blank_issues_enabled: false`. |
| Attack dropdown required | PASS | `attack_type` dropdown has required validation. |
| Allowed attacks | PASS | Dropdown exposes Slash, Critical Strike, Lucky Attack. |
| Issue Forms enabled on GitHub | NOT TESTABLE BEFORE PUSH | Template files are not yet present on GitHub before deployment. |

## README And Asset Path Checks

| Item | Result | Evidence |
| --- | --- | --- |
| README generated locally | PASS | `node scripts/validate_state.js` returned `validation ok`. |
| Main boss card path | PASS | `assets/boss-card.svg` exists and parses as XML. |
| Boss phase art paths | PASS | 24 files exist under `assets/bosses/` and parse as XML. |
| README attack CTA path | PASS | README links to `https://github.com/ratishoberoi/github-boss-raid-dev/issues/new?template=attack.yml`. |

## Required Repository Settings

These settings must be verified in GitHub repository settings after push:

- Actions must be enabled for the repository.
- Workflow permissions must allow read/write, or this workflow's `contents: write` and `issues: write` permissions must be honored.
- The repository must allow GitHub Actions to create commits on the default branch.
- If branch protection is enabled later, `github-actions[bot]` must be allowed to push or bypass rules.
- Issues must be enabled.
- The `raid-attack` label should exist if label display is desired. The workflow also gates on issue body, so the label is not the only trigger condition.

## Deployment Readiness Summary

The local repository is structurally ready to deploy. Live issue-form and workflow execution cannot be verified until the current files are pushed to GitHub. Local credentials allow SSH push, but no local GitHub API token is available for automated live issue creation from this environment.
