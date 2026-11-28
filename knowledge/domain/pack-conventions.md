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
| Item | `crew:<snake>` | `crew:survey_stake`. The sieve is the block `crew:sieve` (`crew_bp/blocks/sieve.json`) |
| Entity property | `crew:role` (int 0–5), `crew:anim` (int 0–4), `crew:loaded` (bool) | client-synced. `crew:loaded` is the Hauler backpack |
| Component group / event | `crew:<snake>` | `crew:idle`, `crew:working`, `crew:manage`, `crew:give_tool`, `crew:start_work`, `crew:stop_work` |
| Slash command and enum | `crew:<snake>` | `crew:guide`, `crew:halt`, `crew:keep`, `crew:cap` |
| Dynamic property | `crew:<name>` | See the lists under this table |
| Family | `crew_worker` (underscore, no colon) plus `mob` | `minecraft:type_family` |

World and entity dynamic properties already in the scripts. Do not rename them.

Older keys, still used: `crew:name`, `crew:ownerId`, `crew:home`, `crew:job`, `crew:places`, `crew:workers`, `crew:toolPref`.

Settlement keys in `crew_bp/scripts/settlement.js` (the comment at the top of that file, and the reads and writes below it):

| Key | Stored as | What the file says |
| --- | --- | --- |
| `crew:settlements` | JSON object through `getJSON` / `setJSON` | Map of settlement id to one settlement |
| `crew:bells` | JSON object | `"dim\|x,y,z"` to the id of the player who placed that bell |
| `crew:seen` | JSON object | Worker id to the last roster note for that worker |
| `crew:queue` | JSON object | Worker id to orders waiting while that worker is unloaded |
| `crew:cap` | A number, `world.getDynamicProperty` / `setDynamicProperty`, not JSON | Workers per person. Missing or not a positive integer reads as `CAP_DEFAULT` (`6`). Operators set it from 1 to 100. |
| `crew:stock:<spot>` | JSON object, one property per spot | `<spot>` is `dim\|x,y,z` from `spotKey`. Last read contents of one storage chest. Properties whose spot is gone are deleted. |
| `crew:devMode` | Boolean on the world, `getDynamicProperty` / `setDynamicProperty` | `devmode.js` sets `true` while operator testing mode is on and deletes the property when it is off. `settlement.js` `capCheck` lifts the worker limit while it is true. Absent means off. |

Hauler keys on the worker, from `crew_bp/scripts/hauler.js`. Do not rename them.

| Key | Stored as | What the file says |
| --- | --- | --- |
| `crew:pickups` | JSON through `getJSON` / `setJSON` | Stake pickup points |
| `crew:rounds` | JSON | Rounds done today |
| `crew:roundsDay` | Dynamic property compared with `today()` | Which day those rounds belong to |
| `crew:haulOff` | Dynamic property | A player stopped rounds until Continue |
| `crew:hold` | Number dynamic property | Idle hold counted down in the round loop |

`crew:loaded` is not one of those. It is the client-synced entity bool above. `hauler.js` sets it when the worker is carrying anything. The render controller shows `pack_full` when role 4 has it, and `pack` when role 4 does not.

`prospect.js` stores `crew:mine` on the worker as JSON: `name`, `number`, `chest`, `decorative`, `quotaOre`, `handoff`, and `levels` (`{y, ores, peak}`).

`crew:role` values, from `ROLE_LIST` in `tools.js` and `syncRole` in `workers.js`, in the same order as `Array.skins` in `crew_rp/render_controllers/worker.render_controllers.json`:

| Index | Role | How a new worker gets it |
| --- | --- | --- |
| 0 | Miner | First tool in the barrel is a pickaxe |
| 1 | Digger | First tool is a shovel |
| 2 | Woodcutter | First tool is an axe |
| 3 | Farmer | First tool is a hoe |
| 4 | Hauler | A bundle and leather boots and no tools (`isHaulerBuild`) |
| 5 | Sifter | A `crew:sieve` in the barrel (`spawnWorker` role override `"Sifter"`) |

On `main` at `13d0b05` those two indexes do not collide. `worker.json` `crew:role` range is 0–5. Flag line 31 described the unmerged Hauler and Sifter branches both appending index 4. The merged pack kept Hauler at 4 and appended Sifter at 5. Do not reorder Miner, Digger, Woodcutter, or Farmer. The render controller hides the hard hat and shows the cap and backpack only when `crew:role` is 4.

File names are `snake_case.json`. Script files are one lowercase module per concern (`runner.js`, `catalog.js`, `marker.js`, `settlement.js`), not a bundle.

The index table above is the skin order. Do not reorder one list without the other.

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
