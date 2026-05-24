# Loot Audit Report

Generated: 2026-05-24T18:02:41.545Z

## Configuration

| Rarity | Configured Drop Rate |
| --- | ---: |
| Common | 80% |
| Rare | 15% |
| Epic | 4% |
| Legendary | 0.9% |
| Mythic | 0.1% |

## Simulation Results

The 100 and 1000 attack simulations used the existing file-backed attack integration in isolated temporary repository copies. The 10000 attack simulation used an in-memory equivalent of the same attack, loot, inventory, death, respawn, README, and SVG rules so distribution validation remains practical.

| Attacks | Result | Mode | Rarity Distribution | Inventory Players | Inventory Total | Legendary History Rows | Distribution Check |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 100 | PASS | file-backed | Common: 82 (82.00%)<br>Rare: 15 (15.00%)<br>Epic: 3 (3.00%)<br>Legendary: 0 (0.00%)<br>Mythic: 0 (0.00%) | 25 | 100 | 0 | Within configured bounds |
| 1000 | PASS | file-backed | Common: 808 (80.80%)<br>Rare: 149 (14.90%)<br>Epic: 32 (3.20%)<br>Legendary: 11 (1.10%)<br>Mythic: 0 (0.00%) | 25 | 1000 | 11 | Within configured bounds |
| 10000 | PASS | in-memory-equivalent | Common: 8025 (80.25%)<br>Rare: 1509 (15.09%)<br>Epic: 366 (3.66%)<br>Legendary: 90 (0.90%)<br>Mythic: 10 (0.10%) | 25 | 10000 | 100 | Within configured bounds |

## Verified

- Drop rates stayed within configured tolerance bands for each simulation size.
- Every successful attack generated exactly one loot drop.
- Player inventory quantities matched attack counts.
- Duplicate player and duplicate item rows were rejected by validation.
- Legendary and Mythic drops were recorded permanently in legendary history.
- README loot sections rendered from final state.
- SVG loot panels rendered from final state.
