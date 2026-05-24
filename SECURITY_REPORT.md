# Security Report

Generated: 2026-05-24T17:33:00Z

## Reviewed Areas

- Issue injection
- Markdown injection
- Username manipulation
- JSON corruption
- Workflow abuse
- GitHub Actions abuse
- Malformed issue payloads
- Unexpected inputs
- Extremely long usernames
- Missing form values
- Duplicate submissions

## Findings And Fixes

| Severity | Problem | Root Cause | Fix | Validation Method |
| --- | --- | --- | --- | --- |
| High | README table injection through attacker names. | Attacker username was rendered directly into Markdown tables. | Added `sanitizeUsername()`, `markdownCell()`, and `markdownUser()`. | Temporary-copy malicious username test produced a safe single table row. |
| High | Malformed JSON could block all future attacks. | JSON parse errors were not caught. | Added defensive JSON reads, normalization, and regeneration persistence. | Temporary-copy malformed JSON test exited 0 and rewrote valid JSON. |
| Medium | Unsupported attack values could reach comments. | Issue-body parser returned arbitrary text after the form heading. | Attack processing now rejects non-whitelisted attack types without state mutation. | Temporary-copy `Delete Everything` attack wrote a rejection result and did not apply damage. |
| Medium | Extremely long usernames could damage presentation. | Display strings had no length bounds. | Username normalization enforces a 39-character GitHub-compatible display length. | Temporary-copy long username test stored a 39-character sanitized username. |
| Medium | Workflow depended on shelling out to `gh`. | External CLI availability was assumed. | Added `scripts/comment_issue.js` using GitHub REST API with `GITHUB_TOKEN`. | Script syntax checked locally; workflow validated with actionlint. |
| Low | Missing form values could create ambiguous behavior. | Missing attack type was not represented in structured metadata. | `handle_attack.js` now writes `attack_result.json` metadata with `ok`, `state_changed`, and `close_issue`. | Missing form test produced a controlled comment body and metadata. |

## Controls In Place

- Only three attack types are accepted: Slash, Critical Strike, Lucky Attack.
- Usernames are normalized before persistence and display.
- Markdown and SVG output escape hostile state values.
- JSON state is normalized before calculations.
- Workflow permissions are limited to `contents: write` and `issues: write`.
- The workflow does not listen to `push`, reducing workflow-loop risk.
- GitHub token pushes are not expected to recursively trigger this workflow; GitHub documents recursive-trigger prevention for `GITHUB_TOKEN`.

## Remaining Security Risks

- Any user who can open issues can intentionally spend Actions minutes by opening attack-form issues. This is inherent to the profile raid mechanic.
- API-created issues can spoof the issue form body. The implementation treats the issue body as untrusted and validates the attack server-side.
- GitHub REST comment/close calls were not executed against GitHub from this local environment.
