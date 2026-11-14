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
| 12 | Villager-style model (big head, nose) with working arms and a hard hat; one skin per role (Miner, Digger, Woodcutter, Farmer), picked by the `crew:role` entity property. About 1.75 blocks tall, so it needs 2 blocks of headroom | Brian, Nov 12: "try the villager model... each worker type has a skin that matches" (replaced the small 1-block model) |
| 13 | Open settings, left as is until Brian says otherwise: fast pace (5x tool speed) open to everyone; server operators can command any worker | Defaults; Brian hasn't decided |
| 14 | Workers never hover or pass through blocks: they stand only where there's a floor and 2 blocks of air, drop straight down rather than gliding over air, and walk by A* when the next spot is more than a step away | Brian, Nov 12: it hovered over the dug area and clipped through obsidian |
| 15 | Branch mine digs ore veins out of the tunnel walls and fills each hole with stone/dirt it dug (walls stay solid) | Brian, Nov 12 |
| 16 | Torches given to a worker are placed as it digs: every 12 blocks of branch, every 10 in the 2-wide trunk, on quarry stair steps. Keeps every tunnel block within 6 of a torch (light 8+) | Brian, Nov 12: "at a distance that will prevent enemy mobs from spawning" |
| 17 | Menu: Take what it carries (to the player), Drop off at a chest (`drop_off` job), and Stop offers stop-and-drop-off. Kit tools and torches always stay with the worker | Brian, Nov 12 |
| 18 | A diggable block at head height over where a worker needs to stand is dug out (even just outside a quarry box), instead of working around it. Never: quarry stair steps, containers with items, liquids, protected blocks, or blocks its tools can't harvest | Brian, Nov 12: "if they run into an object they could dig to unblock them it's ok to remove them" |
| 19 | Digs like a player: one block at a time, each taking its tool's break time, facing the block, with the dig sound; the tool in use shows in its hand (a display copy via `replaceitem`, drop chance 0, so no duplicates) | Brian, Nov 12 |
| 20 | Branch mine `trunk_width` 1-4 (default 2); extra lanes go to the right of the stairs. Trunk torch spacing tightens with width (12/10/8/6) | Brian, Nov 12 |
| 22 | Stopping (or Drop off / Come here) keeps an unfinished quarry or branch mine as paused (`crew:paused`, with its step and queue); "Continue" in the menu, `/crew:continue` or the `resume` job picks it up where it left off. A new dig order replaces it | Brian, Nov 12: "restart from the start" was the only option |
| 23 | v0.4 living workers: a home (claimed bed, one worker per bed, + home chest within 8), dusk-to-dawn sleep (dig paused and auto-resumed), energy drained by digging and restored by sleep and optional food, morning restock of torches, food and tools from the home chest; no home = sleep rough in place | Brian, Nov 13 roadmap |
| 21 | Every Survey Stake menu has "Put the stake away" (removes it from the inventory; the plan is kept). The worker menu has "Get a Survey Stake" (and the "no plan yet" message offers one); only one per player, `/crew:stake` follows the same rule | Brian, Nov 12 |

## What v0.2 does (state at hand-off, Nov 13 2026)
- Packaged in `crew-addon.mcaddon`, manifests 0.2.0. README and `docs/PLAN.md` describe it.
- Jobs: `quarry` (alias `mine_area`), `branch_mine`, `come`, `stop`, `resume`, `status`, `drop_off`,
  `set_home`, `clear_home`; plus the internal `rest` job the routine starts at dusk or when worn out.
- `/reload` only reloads scripts. Changes to the model, textures or `entities/worker.json` need the
  world closed and reopened (safest: quit Minecraft fully and restart).
- Kit in worker slots 0-4, hauling in 5-26. Deterministic Unbreaking (wear every N+1 uses); warns at 10%.
- Skipped blocks go to the `crew:skipped` dynamic property and the status text; branch U-detour.
- Crouch menu (`ui.js openMenu`), tap-to-give (`ui.js giveHeldTool`, wired in `main.js`), stake planner
  (`marker.js`), A* walking (`path.js`), moving ticking area per working worker.
- **Tested:** mock-world Node sim (`tools/sim/run.sh`): quarry 12x10x10, branch 20/8/2 with an obsidian
  detour and a diamond find, tool wear and hand-over (stranger refused), permissions and resume,
  `main.js` loads. tsc type-check clean against the 2.2.0 / server-ui 2.0.0 typings.
- **Tested in game (local "Addon Test" world, Nov 12 2026):** packs load, building a worker, stake plan +
  confirm, crouch menu, quarry and branch mine both dig, obsidian is skipped, a job resumes after leaving
  and reopening the world. Fixed then: crouch-tapping a worker while holding the stake opened the stake's
  plan menu (`main.js` now routes it to the worker).
- **Added Nov 12 after that test, mock-tested only:** decisions 12, 14-21 (villager model and skins,
  standing/no-clipping movement, ore veins + backfill, torches, take/drop off, `drop_off` job).
- **v0.4 home and routine (Nov 13), mock-tested only** (`tools/sim/life_test.mjs`): see decision 23 and
  the Roadmap's v0.4 notes.
- **Not yet tested in game:** the Nov 12 additions, v0.4, and anything on BDS. Likely first fixes: forms and sliders, particle
  outline, the `minecraft:interact` filters (`has_equipment` per tool id), model and animation,
  chat text, scripted gliding movement.

## Known limits
- Movement is scripted gliding along an A* path, not vanilla AI; blinks once if no route.
- Particles hide underground, so branch plans draw as a surface map above the staked block.
- A skipped block exactly on a quarry stair step can break the stair (blink fallback).
- Falling gravel and sand are best-effort. 10 ticking areas per world limit the number of active workers out of range.
- A branch detour can thin the 2-block wall for 3 blocks.
- In a quarry the worker reaches up to 3 blocks rather than walking when the next cell isn't reachable yet.
- Quarry torches only light the stair; the open pit floor isn't lit. Ore veins are only followed in
  branch mines (a quarry never touches blocks outside its box).

## What's left
The release roadmap with task lists is in `docs/PLAN.md` ("Roadmap"). In short, one release at a time,
each tested in game before the next:
1. **v0.3 Better digging:** in-game pass of what's built (tool in hand especially), bump to 0.3.0,
   first server install.
2. **v0.4 Home and daily routine:** bed + home chest, safe-bed check, day clock, routine over jobs,
   energy (sleep and optional food restore it), sleep/eat animations.
3. **v0.5 Prospector:** autonomous `prospect` job (target, start, range, quota), wooden mine
   entrance with a named sign and entrance chest, growing branch mine, caves, hazards, stop rules.
4. **v0.6 Hauler:** new worker that collects from mine entrance chests and consolidates to a depot; `haul`.
5. **v0.7 Character:** ranks, personality, talking, journal and "while you were away".
6. **v0.8 Loose ends:** `collect_skipped`, `scout`, movement polish.
7. **Later:** danger, social, other roles, LLM bridge, contractor mode.

Decided Nov 13: living workers (home, routine, goals); no x-ray; home every night; food optional
(restores energy like sleep); no mob danger yet; keep Quarry and Branch mine. Open questions are
listed at the end of the roadmap.

## Layout
- `crew_bp/` behavior pack. `scripts/main.js` is the entry. `workers.js` spawn, kit, ownership;
  `runner.js` job loop, daily routine and `rest` job; `life.js` home, beds, energy, food, restock; `plans.js` quarry and branch geometry; `path.js` A*; `tools.js` tiers, wear,
  kit; `blocks.js` block tiers and best tool kind; `catalog.js` job schema; `orders.js` dispatcher;
  `ui.js` + `forms.js` menus; `marker.js` Survey Stake; `commands.js` slash commands; `store.js`
  persistence (places); `util.js` helpers. `entities/worker.json`, `items/`, `recipes/survey_stake.json`.
- Player guide: `crew_bp/scripts/guide_pages.js` is the one source for the in-game guide (`/crew:help`,
  "How workers work" in menus, one-time welcome line; `guide.js`) and `PLAYER_GUIDE.md`
  (`node tools/make_guide.mjs`). **Update the pages whenever a feature a player sees changes,** then regenerate.
- `crew_rp/` resource pack (model, textures, lang).
- `tools/build.py` builds `crew-addon.mcaddon` (needs Python, not installed on Brian's PC yet).
  `node tools/make_textures.mjs [previewDir]` redraws the role skins, stake and icons (optional 8x previews).
- `tools/sim/` mock `@minecraft/server` + tests. Extend the mock when you use a new API.

## How to work on it
- **Run tests after every change:** `node tools/sim/run.mjs` (Node 18+, no installs; works on Windows).
  `sh tools/sim/run.sh` does the same where `sh` exists. Each test prints JSON;
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
