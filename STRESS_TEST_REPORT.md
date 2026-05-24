# Stress Test Report

Generated: 2026-05-24T18:28:47.565Z

## Summary

All simulations were run in isolated temporary repository copies. The working repository state was not mutated by the simulations.

| Attack Count | Result | Final Boss | Final HP | Leaderboard Rows | Attack History Rows | Hall of Fame Rows | Inventory Players | Legendary History Rows |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | PASS | The GPU Devourer | 1241 / 1250 | 10 | 10 | 1 | 10 | 0 |
| 50 | PASS | The Gradient Vanisher | 391 / 1750 | 10 | 50 | 3 | 10 | 0 |
| 100 | PASS | The Prompt Goblin | 13 / 2250 | 10 | 100 | 5 | 10 | 0 |
| 500 | PASS | The Overfitted Beast | 2052 / 5000 | 10 | 500 | 16 | 10 | 10 |

## Checks Per Simulation

- HP after every attack matched the rolled damage and clamp rules.
- Boss death recorded a hall-of-fame entry and spawned the next boss at full HP.
- Leaderboard totals matched the sum of applied damage per attacker.
- No duplicate leaderboard entries were present.
- Inventory totals matched one loot drop per successful attack.
- Legendary and Mythic drops were permanently recorded.
- JSON files parsed after the run.
- README and SVG matched deterministic regeneration from final state.
- SVG output had a complete root document.
