# Skill: scripting API

How script changes are made in this repo. Rules and version pins: `knowledge/domain/pack-conventions.md` and `knowledge/domain/server-rules.md`.

## Before editing

1. Read `AGENTS.md`, this file, and the module you are about to change.
2. Read the job you are touching in `crew_bp/scripts/catalog.js` before changing behavior in `runner.js` or `orders.js`.
3. If the work is a feature, `CLAUDE.md` rule 8 says the builder does not start until `specs/<name>.md` is status `ready`. What the other status words say, and what is not written about opening a pull request, is `knowledge/skills/spec-status.md`. A gap in the spec is an open question, not a guess. Flag it and stop on that part.

## Versions in the shipped pack

`crew_bp/manifest.json` depends on:

- `@minecraft/server` `2.2.0`
- `@minecraft/server-ui` `2.0.0`

Do not import any other `@minecraft/*` module from `crew_bp/scripts/`. Do not set a beta version. `@minecraft/server-net` is not a dependency.

`min_engine_version` is `[1, 21, 110]`. Do not lower or raise it as a side effect.

## Where logic lives

| Module | What it owns |
| --- | --- |
| `scripts/main.js` | Entry. Command registration, interact events, load log |
| `scripts/catalog.js` | Job schema (`JOBS`), role gate, `validate`, LLM `toolSchemas()` |
| `scripts/orders.js` | The only dispatcher |
| `scripts/commands.js` | Slash commands `crew:*` |
| `scripts/ui.js`, `scripts/forms.js` | Crouch menu |
| `scripts/marker.js` | Survey Stake |
| `scripts/runner.js` | Job loop, movement steps, the internal `rest` job |
| `scripts/plans.js` | Quarry and branch geometry |
| `scripts/path.js` | A* walk |
| `scripts/blocks.js` | Harvest tiers, hardness, doors, line of sight |
| `scripts/tools.js` | Kit, roles, wear |
| `scripts/life.js` | Home, beds, energy, food, restock |
| `scripts/workers.js` | Spawn, ownership, role property, name tag |
| `scripts/store.js` | World dynamic properties for places and the worker registry |
| `scripts/settlement.js` | Settlement save data and rules. Imports only `store.js` and `util.js`. Menus stay in `ui.js`. Event wiring stays in `main.js`. |
| `scripts/hauler.js` | Hauler rounds, depot, and sorting. Save keys are in `knowledge/domain/pack-conventions.md`. |
| `scripts/plots.js` | Forest and field passes. It does not cook. `catalog.js` jobs: `forest` (Woodcutter) and `field` (Farmer). |
| `scripts/prospect.js` | Miner prospecting. Places `minecraft:oak_sign` and calls `getComponent("minecraft:sign")?.setText`. If the component is missing, the sign block can still be there and the name stays on `crew:mine`. The mock returns that component for block ids that end in `sign`. |
| `scripts/sift.js` | Sifter sieve. `block.getRedstonePower()` keeps a powered sieve running. `crew_bp/blocks/sieve.json` sets `redstone_consumer`. The mock is `getRedstonePower` / `setRedstonePower` in `tools/sim/mock/@minecraft/server/index.js`. |
| `scripts/devmode.js` | Operator testing mode. Calls `world.setTimeOfDay` (`1000` morning, `13000` night). `@minecraft/server` 2.2.0 includes `World.setTimeOfDay`. The mock implements it. |
| `scripts/guide_pages.js` | Player guide source. No game imports, so Node can read it |
| `scripts/util.js` | `VERSION` and small helpers. No game state |

Two builders must not edit the same file in the same week. `runner.js` is the one `CLAUDE.md` names specifically.

## Adding or changing a Script API call

1. Check `tools/sim/mock/@minecraft/server/index.js` or `tools/sim/mock/@minecraft/server-ui/index.js`.
2. If the call is not mocked, add the mock in the same change. A missing mock is a test gap, not a shortcut.
3. Add or extend a `tools/sim/*_test.mjs` that exits non-zero on a wrong result, and register it in the `steps` list in `tools/sim/run.mjs`.
4. Run `node tools/sim/run.mjs`. Exit 0 is required.

Older tests only fail when they crash. New tests must fail on a wrong result. `roles_test.mjs` is the one that already does.

## Orders

A new job is an entry in `JOBS` with `description`, `params`, and `roles` when a role must refuse it. Leave `roles` off only when every role may take it. Set `hidden: true` when players and the LLM must not see it.

Param types the catalog already implements: `vec3`, `enum`, `int`, `bool`, `place`, `player`. `validate` fills defaults. Place names stay strings until the dispatcher resolves them.

Aliases: `mine_area` still maps to `quarry`. Do not remove it without a migration note.

## Dynamic properties

Keys stay `crew:`. JSON values go through `getJSON` / `setJSON` in `util.js`. `crew:cap` is the exception already in `settlement.js`: it is a number on `world.getDynamicProperty` / `setDynamicProperty`, not JSON. Do not rename an existing key, including `crew:settlements`, `crew:bells`, `crew:seen`, `crew:queue`, `crew:cap`, and `crew:stock:<spot>`. The list is in `knowledge/domain/pack-conventions.md`. A shape change needs a migration and a mock test that loads the old value (`migrateRole` is the pattern).

Settlement-wide orders are not new `JOBS` names. `orders.js` `SETTLEMENT_ORDERS` is `stop`, `resume`, `drop_off`, `go_home`, and `come_bell`. `come_bell` is sent as the existing `come` job aimed at the bell. Unloaded workers wait on `crew:queue`. Mock tests: `tools/sim/settlement_test.mjs` and `tools/sim/settlement2_test.mjs`, both named in `tools/sim/run.mjs`.

`forest` and `field` are catalog jobs. Dated rules from `specs/woodcutter-farmer.md` (Brian, 2026-11-27), which `plots.js` is written against:

- Stake the plot once. It keeps going. Footprint at most 64 by 64. Look up at most 48 blocks.
- Woodcutter: natural trees only (a log or stem connected to leaves, or the nether equivalent). Leave beehives and bee nests. Replant the same tree. Strip the leaves of a tree it cuts.
- Farmer: no cooking. Till empty dirt, plant, harvest when mature, replant the same crop. Seeds and special ground come from the player. The Farmer does not dig that ground out of the world.
- Water: a channel every 9 blocks, along the longer side, from water buckets in the home chest or the deposit. An empty bucket goes to the deposit. No bucket means skip the channel. Do not take water from the world.
- Pumpkin and melon: leave the stem, harvest the fruit. Cocoa: on jungle logs the player provides. Sweet berries: pick the bush, do not break it. Sugar cane, cactus, and bamboo: leave the base and harvest above it.

Branch floors for a mine are `ORE_BANDS` in `prospect.js`. The table copied into knowledge is `knowledge/domain/miner-prospecting.md`.

## Branch and pull request

Pack script changes go on `feat/<name>` or `fix/<name>` (`CLAUDE.md` rules 2 and 3) and open a pull request into `main`. The commit subject and the pull request title use `feat(pack):` or `fix(pack):` (`AGENTS.md`). Include the changelog and QA updates on that branch when players would notice. Do not push the branch to `main` yourself. Do not skip the mock tests because the pull request is the review step.
