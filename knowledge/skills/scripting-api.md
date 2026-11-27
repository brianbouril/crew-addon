# Skill: scripting API

How script changes are made in this repo. Rules and version pins: `knowledge/domain/pack-conventions.md` and `knowledge/domain/server-rules.md`.

## Before editing

1. Read `AGENTS.md`, this file, and the module you are about to change.
2. Read the job you are touching in `crew_bp/scripts/catalog.js` before changing behavior in `runner.js` or `orders.js`.
3. If the work is a feature, it needs a `specs/<name>.md` whose status is `ready` (`CLAUDE.md` rule 8). A gap in the spec is an open question, not a guess. Flag it and stop on that part.

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

Keys stay `crew:`. Read and write JSON through `getJSON` / `setJSON` in `util.js`. Do not rename an existing key. A shape change needs a migration and a mock test that loads the old value (`migrateRole` is the pattern).

## Commit

Pack script changes use `fix(pack):` or `feat(pack):` as `AGENTS.md` describes. Include the changelog and QA updates in that commit when players would notice. The branch-versus-`main` conflict is an open question in `knowledge/agents/worker-agent.md`; do not resolve it by skipping tests.
