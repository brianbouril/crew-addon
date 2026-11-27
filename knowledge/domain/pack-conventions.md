# Pack conventions

Facts taken from `crew_bp/`, `crew_rp/`, and `tools/bump_version.py`. Folder names in `docs/grok/*` that say `behavior_packs/` or `resource_packs/` mean these two trees. README copies them onto a Bedrock Dedicated Server as `<server>/behavior_packs/crew_bp/` and `<server>/resource_packs/crew_rp/`.

## Layout

```text
crew_bp/
  manifest.json
  pack_icon.png
  entities/worker.json
  items/survey_stake.json
  recipes/survey_stake.json
  scripts/main.js          # script entry
  scripts/*.js
  texts/en_US.lang
  texts/languages.json     # ["en_US"]
crew_rp/
  manifest.json
  pack_icon.png            # same bytes as the BP icon
  entity/worker.entity.json
  models/entity/worker.geo.json
  animations/worker.animation.json
  render_controllers/worker.render_controllers.json
  textures/item_texture.json
  textures/entity/worker_<role>.png
  textures/items/crew_survey_stake.png
  texts/en_US.lang
  texts/languages.json     # ["en_US"]
```

Behavior-pack entity JSON lives in `entities/`. The client entity lives in `entity/` (singular). Those path names are vanilla Bedrock layout, and this repo follows them.

Only `en_US` is listed. Lang lines are duplicated in both packs. On day 0 the files match except `crew_bp/texts/en_US.lang` is missing `action.interact.crew_give_torches`, which the entity references and the RP lang has. See `inbox/knowledge-flags.jsonl`.

## Identifiers

Everything this add-on defines uses the `crew:` prefix. `CLAUDE.md` rule 4: never rename it. A save-format change needs a one-time migration (the existing example is `migrateRole` in `workers.js`) and a mock test that loads the old format.

| Kind | Pattern | Examples in the repo |
| --- | --- | --- |
| Entity | `crew:worker` | `entities/worker.json`, client entity |
| Item | `crew:<snake>` | `crew:survey_stake` |
| Entity property | `crew:role` (int 0–3), `crew:anim` (int 0–4) | both client-synced |
| Component group / event | `crew:<snake>` | `crew:idle`, `crew:working`, `crew:manage`, `crew:give_tool`, `crew:start_work`, `crew:stop_work` |
| Slash command and enum | `crew:<snake>` | `crew:guide`, `crew:halt`, `crew:keep` |
| Dynamic property | `crew:<name>` | `crew:name`, `crew:ownerId`, `crew:home`, `crew:job`, `crew:places`, `crew:workers`, `crew:toolPref` |
| Family | `crew_worker` (underscore, no colon) plus `mob` | `minecraft:type_family` |

File names are `snake_case.json`. Script files are one lowercase module per concern (`runner.js`, `catalog.js`, `marker.js`), not a bundle.

`crew:role` values: 0 Miner, 1 Digger, 2 Woodcutter, 3 Farmer (`syncRole` in `workers.js`). The render-controller skin array is in that same order. Do not reorder one without the other.

## Manifests and versions

Both manifests use `"format_version": 2` (a number) and `"min_engine_version": [1, 21, 110]`.

Content JSON uses a **string** `format_version`, and the strings differ by file type:

| File | `format_version` |
| --- | --- |
| `crew_bp/entities/worker.json` | `"1.20.80"` |
| `crew_bp/items/survey_stake.json` | `"1.21.0"` |
| `crew_bp/recipes/survey_stake.json` | `"1.20.10"` |
| `crew_rp/entity/worker.entity.json` | `"1.10.0"` |
| `crew_rp/models/entity/worker.geo.json` | `"1.12.0"` |
| `crew_rp/animations/worker.animation.json` | `"1.8.0"` |
| `crew_rp/render_controllers/worker.render_controllers.json` | `"1.8.0"` |

There is no written rule that new files must pick one of these. Match the closest existing file of the same type. Do not bump a `format_version` as a drive-by.

Pack version is the triplet `[0, 4, 0]` / `"0.4.0"` in all of these together (`tools/bump_version.py` is the only editor):

- `crew_bp/manifest.json` header, data module, script module, and the dependency on the RP
- `crew_rp/manifest.json` header and resources module
- `crew_bp/scripts/util.js` `export const VERSION`

UUIDs are fixed (`CLAUDE.md` rule 4). `bump_version.py` refuses to touch them.

| | UUID |
| --- | --- |
| BP header | `45c91f8b-1a45-49e5-b41a-0c8206b5596c` |
| BP data module | `b8a8b639-58e4-449f-8a1d-d0a9754b47d5` |
| BP script module | `948413df-23c4-431d-86b1-02762a60f5d8` |
| RP header | `b077ee39-0d38-4590-9be0-8dd5396dbf7b` |
| RP resources module | `a9c40f35-11fd-46ea-ab04-5a5070c993f4` |

Script dependencies, and no others, in the BP manifest:

- `@minecraft/server` `2.2.0`
- `@minecraft/server-ui` `2.0.0`

The BP header description still says "v0.2: quarry and branch mining". The version fields say 0.4.0. That description is stale (flagged).

## Script shape

- ES modules. Imports use the `.js` suffix and double quotes. Semicolons. JSDoc `@param` types via `import("@minecraft/server")`.
- Entry: `scripts/main.js`. Startup registers custom commands on `system.beforeEvents.startup`, then logs `[Crew] v<VERSION> loaded` and `[Crew-Schema]`.
- Jobs are data in `catalog.js` (`JOBS`). `orders.js` is the only dispatcher. Commands, the menu, and a future LLM bridge all build `{by, worker, job, params}`.
- Console lines that already exist: `[Crew]`, `[Crew-Schema]`, `[Crew-Event]`, `[Crew-Result]`, `[Crew-Inside]`, `[Crew-NoSight]`, `[Crew-Blink]`.
- Player-visible guide copy is authored in `guide_pages.js`, not by editing `PLAYER_GUIDE.md` directly.

## Open questions

1. No document says which `format_version` a brand-new file type should use. Day 0's rule is "copy the nearest existing file".
2. Whether BP and RP `en_US.lang` are both required, or only the RP string is shown for `interact_text`, is not stated. Both files exist and have been kept almost identical, so new strings go in both.
