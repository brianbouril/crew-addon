# Crew Workers: Minecraft Bedrock add-on

Start here. This file plus `docs/PLAN.md` (full plan, job spec, architecture, LLM bridge design) and
`README.md` (install, player guide, test steps) are the whole context; nothing outside this folder
is needed. Owner: Brian, who hosts a Bedrock Dedicated Server (BDS) for friends.

## The goal, in two steps
1. **Deterministic workers (now):** small worker mobs that do jobs like vanilla mobs do: strip-mine a
   marked area, store what they dig in a chest, later haul to a named depot ("blue base") and report
   finds such as abandoned structures. Same input, same result, every time.
2. **LLM "general contractor" (later):** players give orders in plain words in game, an LLM turns them
   into the same job calls. Runs on BDS (console bridge first, `@minecraft/server-net` maybe later).
   Brian's rule: "Build it with the LLM in mind but it should work without it to start."

So: every job is a typed, validated order (`catalog.js` -> `orders.js`). Slash commands, the menu and
a future LLM bridge all produce the same `{by, worker, job, params}` object. The LLM never pathfinds
or decides block logic; it only picks jobs and fills parameters.

## Decisions and why
| # | Decision | Why / source |
|---|---|---|
| 1 | Bedrock, stable Script API only: `@minecraft/server` 2.2.0, `@minecraft/server-ui` 2.0.0 | Brian's platform; stable loads on any current BDS without experiment toggles |
| 2 | Build: barrel with 1-5 tools inside, carved pumpkin on top. **No iron block.** Placer owns it | Brian, restated twice (like the copper golem build) |
| 3 | Tools set role and stats: pickaxe = Miner (shovel Digger, axe Woodcutter, hoe Farmer are stubs). Tier gates what it can harvest (vanilla), material sets speed | Brian: "base the role on the tool... matches the stats of that tool" |
| 4 | A kit of several tools. Per block: right kind, lowest tier that can harvest, most worn first. Switch on break; stop at the chest only when nothing can continue | Brian: "put more than one tool inside"; saves the good pickaxe for ore |
| 5 | Never break a block no tool can harvest: leave it, log it, dig around it | Brian: don't waste blocks; log feeds a later `collect_skipped` job |
| 6 | Hold a tool and tap a worker = give it. Crouch + tap = menu | Brian |
| 7 | Menu: jobs with parameters, name, role, who can give orders, tools and durability. Non-permitted players see status only | Brian: "custom menu... whether to name them and who has permissions" |
| 8 | Owner plus allowed players can command; owner manages the list. Persisted on the worker | Brian, Nov 12 |
| 9 | Quarry leaves a walkable stair in the wall | Brian: "a path they can travel up and down" |
| 10 | Branch mine: stairs to target Y, 2-wide trunk, 1x2 branches both sides, **2 solid blocks between branches**, lengths editable | Brian corrected spacing to two solid blocks |
| 11 | Survey Stake: particle outline, direction from facing, size by sliders, preview then confirm | Brian: "visual outline and a way to outline the direction, area, and size" |
| 12 | Small custom hard-hat model (1 block tall) | Fits 1-high tunnels; Brian said villager or custom |
| 13 | Open settings, left as is until Brian says otherwise: fast pace (5x tool speed) open to everyone; server operators can command any worker | Defaults; Brian hasn't decided |

## What v0.2 does (state at hand-off, Nov 13 2026)
- Packaged in `crew-addon.mcaddon`, manifests 0.2.0. README and `docs/PLAN.md` describe it.
- Jobs: `quarry` (alias `mine_area`), `branch_mine`, `come`, `stop`, `status`.
- Kit in worker slots 0-4, hauling in 5-26. Deterministic Unbreaking (wear every N+1 uses); warns at 10%.
- Skipped blocks go to the `crew:skipped` dynamic property and the status text; branch U-detour.
- Crouch menu (`ui.js openMenu`), tap-to-give (`ui.js giveHeldTool`, wired in `main.js`), stake planner
  (`marker.js`), A* walking (`path.js`), moving ticking area per working worker.
- **Tested:** mock-world Node sim (`tools/sim/run.sh`): quarry 12x10x10, branch 20/8/2 with an obsidian
  detour and a diamond find, tool wear and hand-over (stranger refused), permissions and resume,
  `main.js` loads. tsc type-check clean against the 2.2.0 / server-ui 2.0.0 typings.
- **Not tested:** anything in a real client or BDS. Likely first fixes: forms and sliders, particle
  outline, the `minecraft:interact` filters (`has_equipment` per tool id), model and animation,
  chat text, scripted gliding movement.

## Known limits
- Movement is scripted gliding along an A* path, not vanilla AI; blinks once if no route.
- Particles hide underground, so branch plans draw as a surface map above the staked block.
- A skipped block exactly on a quarry stair step can break the stair (blink fallback).
- Falling gravel and sand are best-effort. 10 ticking areas per world limit the number of active workers out of range.
- A branch detour can thin the 2-block wall for 3 blocks.

## What's left, in priority order
1. **Test v0.2 in game** (README test steps) on the local "Addon Test" world, then BDS. Fix what breaks.
2. **`haul` to a named depot** (places already exist in `store.js`).
3. **Find and structure reports** (`scout`; block signatures since structure APIs are beta).
4. **`collect_skipped`** job using the `crew:skipped` log.
5. **Other roles:** Woodcutter, Digger, Farmer jobs.
6. **Better pathfinding/movement:** walking animation, tool in hand, smarter routes, action-bar progress.
7. **LLM bridge on BDS:** console bridge reading `[Crew-Event]` lines and writing `crew:exec {json}`;
   schema already printed as `[Crew-Schema]` at startup; `/crew:ask` is the in-game hook.

## Layout
- `crew_bp/` behavior pack. `scripts/main.js` is the entry. `workers.js` spawn, kit, ownership;
  `runner.js` job loop; `plans.js` quarry and branch geometry; `path.js` A*; `tools.js` tiers, wear,
  kit; `blocks.js` block tiers and best tool kind; `catalog.js` job schema; `orders.js` dispatcher;
  `ui.js` + `forms.js` menus; `marker.js` Survey Stake; `commands.js` slash commands; `store.js`
  persistence (places); `util.js` helpers. `entities/worker.json`, `items/`, `recipes/survey_stake.json`.
- `crew_rp/` resource pack (model, textures, lang).
- `tools/build.py` builds `crew-addon.mcaddon`. `tools/make_textures.py` redraws textures.
- `tools/sim/` mock `@minecraft/server` + tests. Extend the mock when you use a new API.

## How to work on it
- **Run tests after every change:** `sh tools/sim/run.sh` (Node 18+, no installs). Each test prints JSON;
  check `missing`, `extraDug`, `leftInBox`, `shortcutsTaken`.
- **Type-check (optional):** in a scratch folder `npm i typescript @minecraft/server@2.2.0 @minecraft/server-ui@2.0.0`,
  then `tsc --allowJs --checkJs --noEmit` over `crew_bp/scripts/*.js` (strict, ES2022, bundler resolution).
- **Build:** `python3 tools/build.py` -> `crew-addon.mcaddon` (zip of `crew_bp.mcpack` + `crew_rp.mcpack`).
- **Bump versions** in both manifests (header, modules, dependency) and `VERSION` in `util.js` together.
- **Install to a local world:** double-click the .mcaddon (Windows) or copy the folders into
  `development_behavior_packs` / `development_resource_packs` of your Minecraft data folder, then
  activate both packs on the world.
- **Install to BDS:** see README "Install on Bedrock Dedicated Server" (pack UUIDs and
  `world_behavior_packs.json` / `world_resource_packs.json`, `texturepack-required=true`).
- In game, watch the server console for `[Crew] v0.2.0 loaded`, `[Crew-Event]` lines and script errors.
