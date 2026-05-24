# Live Deployment Report

Generated: 2026-05-24T18:20:00Z
Updated after initial push: 2026-05-24T18:24:00Z

## Evidence Categories

- **Local**: Verified from files and commands in this workspace.
- **GitHub API unauthenticated**: Verified through public GitHub API endpoints.
- **Live GitHub Actions**: Requires a pushed workflow and an opened attack issue.
- **Not testable**: Could not be observed with available credentials or repository state.

## Pre-Feature Deployment Status

| Feature | Result | Evidence |
| --- | --- | --- |
| Repository exists on GitHub | PASS | GitHub API reports `ratishoberoi/github-boss-raid-dev`, public, default branch `main`. |
| SSH push credentials available | PASS | SSH authentication succeeded as `ratishoberoi`. |
| Branch accepts direct pushes | LIKELY PASS | GitHub API reports `main` is not protected. Actual push still must be observed. |
| Workflow file valid locally | PASS | `actionlint v1.7.12` returned no errors. |
| Workflow deployed to GitHub | FAIL BEFORE PUSH | GitHub API returned `total_count: 0` workflows before pushing current files. |
| Workflow deployed to GitHub after push | PASS | GitHub API returned `Raid Attack`, `active`, path `.github/workflows/raid-attack.yml`. |
| Issue form deployed to GitHub after push | PASS | GitHub API contents endpoint returned `.github/ISSUE_TEMPLATE/attack.yml`. |
| README deployed to GitHub after push | PASS | Raw GitHub README begins with `# ⚠ GLOBAL RAID ACTIVE`. |
| SVG assets deployed to GitHub after push | PASS | Raw GitHub URLs for `assets/boss-card.svg` and `assets/bosses/gpu_devourer_p3.svg` returned SVG content. |
| Attack issue creation | NOT TESTABLE | No `GITHUB_TOKEN` or `GH_TOKEN` is available locally; unauthenticated GitHub API issue creation returned HTTP 401. |
| Workflow trigger | NOT TESTABLE | No live issue was created; GitHub API reports `actions/runs` total_count `0`. |
| Damage calculation live | NOT TESTABLE | Requires live workflow run. |
| JSON state updates live | NOT TESTABLE | Requires live workflow run and commit observation. |
| README regeneration live | NOT TESTABLE | Requires live workflow run and commit observation. |
| SVG regeneration live | NOT TESTABLE | Requires live workflow run and commit observation. |
| Commit back to repository live | NOT TESTABLE | Requires live workflow run. |
| Issue comment creation live | NOT TESTABLE | Requires live issue and workflow token execution. |
| Issue auto-close live | NOT TESTABLE | Requires live issue and workflow token execution. |
| Loot generation live | NOT TESTABLE | Requires live workflow run. |
| Inventory update live | NOT TESTABLE | Requires live workflow run. |
| Leaderboard update live | NOT TESTABLE | Requires live workflow run. |
| Boss phase update live | NOT TESTABLE | Requires live workflow run. |

## Local Verification Already Passed

- `node scripts/validate_state.js`
- JSON parse for data files
- SVG XML parse for generated SVG files
- `actionlint v1.7.12`
- Previous stress and loot audit reports in this repository
- Initial deployment commit `9e065ce` pushed to `origin/main`.

## Warnings

- No `GITHUB_TOKEN` or `GH_TOKEN` is available locally, so automated issue creation through the GitHub API is not available from this environment.
- Public GitHub API access cannot verify repository Actions settings that require admin authentication.
- Live workflow success must not be claimed until an actual issue-triggered run is observed on GitHub.

## Manual Setup Requirements

- Push the current repository contents.
- Confirm Actions are enabled in repository settings.
- Confirm workflow permissions allow write access.
- Confirm Issues are enabled.
- Open a real attack issue through the deployed issue form or provide a GitHub API token for automated issue creation.
