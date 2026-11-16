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
| 13 | Server operators can command any worker (the 5x fast pace that was here was removed Nov 14, decision 30) | Default; Brian hasn't decided |
| 14 | Workers never hover or pass through blocks: they stand only where there's a floor and 2 blocks of air, drop straight down rather than gliding over air, and walk by A* when the next spot is more than a step away | Brian, Nov 12: it hovered over the dug area and clipped through obsidian |
| 15 | Branch mine digs ore veins out of the tunnel walls and fills each hole with stone/dirt it dug (walls stay solid) | Brian, Nov 12 |
| 16 | Torches given to a worker are placed as it digs: every 12 blocks of branch, every 10 in the 2-wide trunk, on quarry stair steps. Keeps every tunnel block within 6 of a torch (light 8+) | Brian, Nov 12: "at a distance that will prevent enemy mobs from spawning" |
| 17 | Menu: Take what it carries (to the player), Drop off at a chest (`drop_off` job), and Stop offers stop-and-drop-off. Kit tools and torches always stay with the worker | Brian, Nov 12 |
| 18 | A diggable block at head height over where a worker needs to stand is dug out (even just outside a quarry box), instead of working around it. Never: quarry stair steps, containers with items, liquids, protected blocks, or blocks its tools can't harvest | Brian, Nov 12: "if they run into an object they could dig to unblock them it's ok to remove them" |
| 19 | Digs like a player: one block at a time, each taking its tool's break time, facing the block, with the dig sound; the tool in use shows in its hand (a display copy via `replaceitem`, drop chance 0, so no duplicates) | Brian, Nov 12 |
| 20 | Branch mine `trunk_width` 1-4 (default 2); extra lanes go to the right of the stairs. Trunk torch spacing tightens with width (12/10/8/6) | Brian, Nov 12 |
| 22 | Stopping (or Drop off / Come here) keeps an unfinished quarry or branch mine as paused (`crew:paused`, with its step and queue); "Continue" in the menu, `/crew:continue` or the `resume` job picks it up where it left off. A new dig order replaces it | Brian, Nov 12: "restart from the start" was the only option |
| 23 | v0.4 living workers: a home (claimed bed, one worker per bed, + home chest within 8), dusk-to-dawn sleep (dig paused and auto-resumed), energy drained by digging and restored by sleep and optional food, morning restock of torches, food and tools from the home chest; no home = sleep rough in place | Brian, Nov 13 roadmap |
| 24 | The Survey Stake is the remote: tap a worker to link it (`crew:linked` on the player); then a bed = its home (any distance), a chest = home chest / drop-off / named place, the ground = plan a dig (offers to start it with the linked worker), the air = its orders, your plan, link another. Works while the worker's area is loaded | Brian, Nov 13: setting a far bed meant standing by it with the worker's menu open; asked for one device to manage workers |
| 25 | Workers keep everything they dig by default (`keep` default `all`), with 36 inventory slots like a player (kit in 0-4); night is dusk 12000 to dawn 23000 | Brian, Nov 13: chest looked empty; worker went to bed at dawn |
| 28 | A sleeping worker's menu opens (crouch-tap it or its bed) without waking it; "Wake up" or any order wakes it; woken at night it stays up while busy and returns to bed after 60 s idle (`crew:stayUp`) | Brian, Nov 14 |
| 29 | Tools menu setting: "Save my best tools" (default) or "Use the fastest tool" (`crew:toolPref`, `chooseTool` prefer) | Brian, Nov 14 |
| 30 | No Fast pace: player speed only. The mock tests' 5x speed-up is `globalThis.crewTestFast`, set by the mock, not an order param | Brian, Nov 14 |
| 31 | Workers dig only what they can see (`canSee` line of sight) and walk (never teleport) to a spot with a view; an `unstick` safety net logs `[Crew-Inside]` and steps out if one is ever inside a block | Brian, Nov 14: passed through a quarry stair |
| 26 | Quarry "Clear above" (`clear_above`; on by default from the stake, off by default for raw orders): measured at plan and at start (`blocks.js layersAbove`: up to open sky, 3 empty layers in a row; refused past 48), cleared top down as `pre` steps before the quarry's own; the worker reaches up from the ground (never climbs onto what it clears) | Brian, Nov 14: "no floating blocks above the quarry area" |
| 27 | Workers walk through wooden doors and fence gates (open, step through, close behind; iron only if open) and never break doors, gates or trapdoors | Brian, Nov 14 |
| 32 | Two digging roles with a **hard split** (built Nov 15): Digger (shovel) takes `quarry` and later earthworks; Miner (pickaxe) takes `prospect` (v0.6) and inherits every Prospector decision (there's no separate Prospector worker). `branch_mine` is no longer an order: kept hidden (`catalog.js hidden`) for prospecting to build on. Each refuses the other's orders; come, stop, resume, status, drop off and home stay open to all. Role at build = first tool's kind. Workers from before the split became Diggers once (`migrateRole`) | Brian, Nov 15: "we are still testing so I'd rather make a hard split between the roles and the orders they can take"; "convert them to diggers now and remove the branch mine option" |
| 21 | Every Survey Stake menu has "Put the stake away" (removes it from the inventory; the plan is kept). The worker menu has "Get a Survey Stake" (and the "no plan yet" message offers one); only one per player, `/crew:stake` follows the same rule | Brian, Nov 12 |

## Current state (v0.4.0, released Nov 14 2026)
- Last release: 0.4.0 (tag `v0.4.0`, `dist/crew-addon-0.4.0.mcaddon`); v0.3 and v0.4 shipped together.
  Earlier: tag `v0.2.0` (the hand-off). README and `docs/PLAN.md` describe it.
- Digging: break time = tool speed (+Efficiency) over block hardness (`blocks.js hardness`), like a
  player; the block breaks at the end of the swing. Steps ease in and out at about a villager's pace.
- Jobs: `quarry` (alias `mine_area`; Digger only), `branch_mine` (hidden since Nov 15, Miner only, internal orders), `come`, `stop`, `resume`, `status`, `drop_off`,
  `set_home`, `clear_home`; plus the internal `rest` job the routine starts at dusk or when worn out.
- `/reload` only reloads scripts. Changes to the model, textures or `entities/worker.json` need the
  world closed and reopened (safest: quit Minecraft fully and restart).
- Kit in worker slots 0-4, carrying in 5-35 (36 slots, like a player). Deterministic Unbreaking (wear every N+1 uses); warns at 10%.
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
- **v0.4 home and routine (Nov 13)** (`tools/sim/life_test.mjs`): see decision 23 and the Roadmap's v0.4
  notes. First in-game run (Nov 13): going home, unloading, sleeping and resuming all worked per the
  log; fixed after it: bed at dawn, setting far beds (stake remote, decision 24), keep-all inventory
  (decision 25).
- **Tested in game Nov 14 (local world), all good:** stake remote, keep-everything and drop-off
  messages, night/dawn routine, sleep pose in bed and rough sleep, tool in hand, block-by-block
  digging at player speed, food. Fixed during it: idle homeless workers didn't sleep, stake plan menu
  looping back to the type picker, bump-and-bounce on each step, snapping during swings.
- **Not yet tested:** anything on BDS (first server install of 0.4.0 is next).
- **Next fixes:** PLAN "Next fixes (0.4.x patch)": doors (open, walk through, close; never break).
  Later idea: more natural walking, straight lines instead of right angles (PLAN v0.9).

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
3. **v0.5 Two digging roles (decision 32):** hard split; Digger (shovel) quarries, Miner (pickaxe)
   waits for prospecting; branch mine no longer orderable. Built Nov 15 (mock-tested), server pending.
4. **v0.6 Miner: prospecting** (planned as "Prospector"; it's the Miner, not a new worker):
   autonomous `prospect` job (target, start, range, quota), wooden mine entrance with a named sign
   and entrance chest, growing branch mine, caves, hazards, stop rules, makes its own tools.
5. **v0.7 Hauler:** new worker that collects from mine entrance chests and consolidates to a depot; `haul`.
6. **v0.8 Character:** ranks, personality, talking, journal and "while you were away".
7. **v0.9 Loose ends:** `collect_skipped`, `scout`, movement polish.
8. **Later:** Digger earthworks (flatten, fill, trench, paths), danger, social, other roles, LLM
   bridge, contractor mode.

Decided Nov 13: living workers (home, routine, goals); no x-ray; home every night; food optional
(restores energy like sleep); no mob danger yet; keep Quarry and Branch mine. Open questions are
listed at the end of the roadmap.

## Layout
- `crew_bp/` behavior pack. `scripts/main.js` is the entry. `workers.js` spawn, kit, ownership;
  `runner.js` job loop, daily routine and `rest` job; `life.js` home, beds, energy, food, restock; `plans.js` quarry and branch geometry; `path.js` A*; `tools.js` tiers, wear,
  kit; `blocks.js` block tiers and best tool kind; `catalog.js` job schema; `orders.js` dispatcher;
  `ui.js` + `forms.js` menus; `marker.js` Survey Stake; `commands.js` slash commands; `store.js`
  persistence (places); `util.js` helpers. `entities/worker.json`, `items/`, `recipes/survey_stake.json`.
- Player guide: `crew_bp/scripts/guide_pages.js` is the one source for the in-game guide (`/crew:guide`,
  "How workers work" in menus, one-time welcome line; `guide.js`) and `PLAYER_GUIDE.md`
  (`node tools/make_guide.mjs`). **Update the pages whenever a feature a player sees changes,** then regenerate.
- `crew_rp/` resource pack (model, textures, lang).
- `tools/release.mjs` cuts a release (tests, version bump, guide, `dist/crew-addon-<v>.mcaddon`, git commit + tag).
  `node tools/make_textures.mjs [previewDir]` redraws the role skins, stake and icons (optional 8x previews).
- `tools/sim/` mock `@minecraft/server` + tests. Extend the mock when you use a new API.

## How to work on it
- **Run tests after every change:** `node tools/sim/run.mjs` (Node 18+, no installs; works on Windows).
  `sh tools/sim/run.sh` does the same where `sh` exists. Each test prints JSON;
  check `missing`, `extraDug`, `leftInBox`, `shortcutsTaken`.
- **Type-check (optional):** in a scratch folder `npm i typescript @minecraft/server@2.2.0 @minecraft/server-ui@2.0.0`,
  then `tsc --allowJs --checkJs --noEmit` over `crew_bp/scripts/*.js` (strict, ES2022, bundler resolution).
- **Git:** the project is a git repo (Git for Windows, `C:\Program Files\Git\cmd\git.exe`; may not be on
  PATH in an old shell). Branch `main`; releases are tags `vX.Y.Z`. Commit work as it lands; add a line
  to `CHANGELOG.md` under "Unreleased" for anything a player would notice, and an in-game check to
  `docs/QA.md` under "Next release" (the running test list; Brian ticks it off when he tests).
- **Release:** `node tools/release.mjs X.Y.Z` with a clean tree: runs the tests (stops if they fail),
  sets the version in both manifests (header, modules, BP->RP dependency) and `VERSION` in `util.js`,
  turns "Unreleased" into that version, regenerates the guide, builds `dist/crew-addon-X.Y.Z.mcaddon`,
  commits and tags. `--build-only` bumps and builds without git. Every server update needs a new
  version, or players keep their cached old resource pack.
- **Install to a local world:** double-click the .mcaddon (Windows) or copy the folders into
  `development_behavior_packs` / `development_resource_packs` of your Minecraft data folder, then
  activate both packs on the world.
- **Shared roadmap (Brian, Nov 14):** every roadmap change in `docs/PLAN.md` also goes into the
  Google Doc "Crew Workers Roadmap" that friends read (edit in place, same link, player wording, no
  dates). Friends' comments there are shown to Brian and folded into the plan only after his OK.
- **Sync snapshot (Brian, Nov 15):** Brian's Claude Duet channel reads Google Drive folder "Crew Addon
  Sync". After every meaningful change (commit, server push, release, QA results, roadmap change)
  refresh both: upload `crew-addon-source-<commit>.zip` (`git archive --format=zip
  --prefix=crew-addon/ <commit>`: tracked files only, no worlds or builds) and update the Google Doc
  "Crew Addon Status" in place (version and commit, changelog since v0.2, roles and jobs, server vs
  Addon Test, open QA, roadmap next). Never change game code for it.
- **Server rule (Brian, Nov 14):** never copy changes to the server (`C:\MinecraftServer` since Nov 15; it runs headless from the
  "Minecraft Bedrock Server" scheduled task: stop with its `stop-server.bat`, start again with
  `Start-ScheduledTask 'Minecraft Bedrock Server'` as admin, output in its `logs\server.log`)
  or reload it without Brian's OK for that update. Local test world dev packs are fine. Back up first.
- **Install to BDS:** see README "Install on Bedrock Dedicated Server" (pack UUIDs and
  `world_behavior_packs.json` / `world_resource_packs.json`, `texturepack-required=true`).
- In game, watch the server console for `[Crew] v<version> loaded`, `[Crew-Event]` lines and script errors.
