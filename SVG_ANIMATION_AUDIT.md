# SVG Animation Audit

Date: 2026-05-25

## Scope

The boss phase SVGs now use the existing phase PNGs in `assets/boss_phases/` as the visual source of truth.

The SVG layer only wraps the PNG and adds animated effects. It does not redraw, replace, simplify, or invent boss artwork.

## Source Validation

PASS: all 24 source PNG files exist in `assets/boss_phases/`.

PASS: all 24 source PNG files are `1672 x 941` RGB PNGs.

PASS: all 24 generated SVGs reference `../boss_phases/<boss>_p<phase>.png`.

PASS: no generated boss SVG references `assets/master_boss_art`.

## SVG Validation

PASS: all 24 generated phase SVGs were opened and parsed as XML.

PASS: every SVG contains exactly one phase PNG `<image>` reference.

PASS: every referenced PNG path exists locally.

PASS: every SVG uses SVG-native animation only. No JavaScript is present.

## Required Animation Coverage

Global animation classes included across every phase SVG:

- `pulsing-glow`
- `energy-movement`
- `scanline-movement`
- `reactor-flicker`
- `corruption-pulse`
- `eye-glow-pulse`
- `threat-indicator-pulse`

Boss-specific animation classes:

- GPU Devourer: `ember-rise`, `mouth-fire`, `heat-distortion`, `smoke-drift`
- Data Leak Hydra: `data-waterfall`, `lock-drift`, `corruption-particle`, `data-leak`
- Gradient Vanisher: `orbiting-planet`, `rotating-equation`, `void-particle-drift`, `spin`
- Hallucination Titan: `orbiting-face`, `apparition-fade`, `memory-fragment`, `eye-glow-pulse`
- Overfitted Beast: `moving-chain`, `lightning-arc`, `glowing-vein`, `corruption-pulse`
- Prompt Goblin: `magic-circle-rotate`, `spell-page-drift`, `prompt-fragment`, `energy-movement`

## Phase File Matrix

| SVG | Source PNG | Animation Layer |
| --- | --- | --- |
| `assets/bosses/gpu_devourer_p1.svg` | `assets/boss_phases/gpu_devourer_p1.png` | reactor glow, eye glow, embers, mouth fire, heat distortion, smoke drift |
| `assets/bosses/gpu_devourer_p2.svg` | `assets/boss_phases/gpu_devourer_p2.png` | stronger reactor glow, eye glow, embers, mouth fire, heat distortion, smoke drift |
| `assets/bosses/gpu_devourer_p3.svg` | `assets/boss_phases/gpu_devourer_p3.png` | molten reactor pulse, stronger embers, mouth fire, city-heat overlays, smoke drift |
| `assets/bosses/gpu_devourer_p4.svg` | `assets/boss_phases/gpu_devourer_p4.png` | strongest reactor pulse, eye glow, embers, mouth fire, apocalypse heat distortion, smoke drift |
| `assets/bosses/data_leak_hydra_p1.svg` | `assets/boss_phases/data_leak_hydra_p1.png` | binary streams, data waterfalls, corruption particles, lock drift, red/green leak effects |
| `assets/bosses/data_leak_hydra_p2.svg` | `assets/boss_phases/data_leak_hydra_p2.png` | denser binary streams, data waterfalls, corruption particles, lock drift, red/green leak effects |
| `assets/bosses/data_leak_hydra_p3.svg` | `assets/boss_phases/data_leak_hydra_p3.png` | heavy binary streams, data waterfalls, corruption particles, lock drift, red/green leak effects |
| `assets/bosses/data_leak_hydra_p4.svg` | `assets/boss_phases/data_leak_hydra_p4.png` | maximum binary streams, data waterfalls, corruption particles, lock drift, red/green leak effects |
| `assets/bosses/gradient_vanisher_p1.svg` | `assets/boss_phases/gradient_vanisher_p1.png` | singularity pulse, orbiting planet, rotating equation, drifting particles, void ring |
| `assets/bosses/gradient_vanisher_p2.svg` | `assets/boss_phases/gradient_vanisher_p2.png` | dual singularity pulse, orbiting planets, rotating equations, drifting particles, void rings |
| `assets/bosses/gradient_vanisher_p3.svg` | `assets/boss_phases/gradient_vanisher_p3.png` | reality fractures, singularity pulses, orbiting planets, rotating equations, drifting particles |
| `assets/bosses/gradient_vanisher_p4.svg` | `assets/boss_phases/gradient_vanisher_p4.png` | cosmic collapse overlays, singularity pulses, orbiting planets, rotating equations, drifting particles |
| `assets/bosses/hallucination_titan_p1.svg` | `assets/boss_phases/hallucination_titan_p1.png` | floating faces, blinking eyes, apparition fade, memory fragments |
| `assets/bosses/hallucination_titan_p2.svg` | `assets/boss_phases/hallucination_titan_p2.png` | more floating faces, orbiting faces, blinking eyes, apparition fade, memory fragments |
| `assets/bosses/hallucination_titan_p3.svg` | `assets/boss_phases/hallucination_titan_p3.png` | dense floating faces, orbiting faces, blinking eyes, apparition fade, memory fragments |
| `assets/bosses/hallucination_titan_p4.svg` | `assets/boss_phases/hallucination_titan_p4.png` | 100+ face overlay, orbiting faces, blinking eyes, apparition fade, memory fragments |
| `assets/bosses/overfitted_beast_p1.svg` | `assets/boss_phases/overfitted_beast_p1.png` | moving chains, chest corruption pulse, lightning arcs, glowing veins, energy surge |
| `assets/bosses/overfitted_beast_p2.svg` | `assets/boss_phases/overfitted_beast_p2.png` | breaking chains, chest corruption pulse, lightning arcs, glowing veins, energy surge |
| `assets/bosses/overfitted_beast_p3.svg` | `assets/boss_phases/overfitted_beast_p3.png` | mutation surge, moving chains, chest corruption pulse, lightning arcs, glowing veins |
| `assets/bosses/overfitted_beast_p4.svg` | `assets/boss_phases/overfitted_beast_p4.png` | catastrophic corruption pulse, moving chains, lightning arcs, glowing veins, energy surge |
| `assets/bosses/prompt_goblin_p1.svg` | `assets/boss_phases/prompt_goblin_p1.png` | floating runes, rotating magic circles, drifting spell pages, prompt fragments, magic pulse |
| `assets/bosses/prompt_goblin_p2.svg` | `assets/boss_phases/prompt_goblin_p2.png` | denser runes, rotating magic circles, drifting spell pages, prompt fragments, magic pulse |
| `assets/bosses/prompt_goblin_p3.svg` | `assets/boss_phases/prompt_goblin_p3.png` | warlock runes, rotating magic circles, drifting spell pages, prompt fragments, magic pulse |
| `assets/bosses/prompt_goblin_p4.svg` | `assets/boss_phases/prompt_goblin_p4.png` | reality manipulation runes, rotating magic circles, drifting spell pages, prompt fragments, magic pulse |

## Commands Run

- `node --check scripts/raid.js`
- `node scripts/render_readme.js`
- XML parse for every `assets/bosses/*.svg`
- PNG path validation for every SVG `<image href>`
- animation class coverage scan

## GitHub Rendering Check

Pending push at local audit time. After push, verify GitHub serves every SVG and every referenced PNG with HTTP 200.
