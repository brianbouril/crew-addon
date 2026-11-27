## Shared Knowledge Base

Read and follow `AGENTS.md` and `knowledge/` before making changes. `AGENTS.md` is the shared entry point for every assistant. The procedures in `knowledge/skills/`, the rules in `knowledge/domain/` (including `visual-identity.md`), the pointers in `knowledge/data-access/`, and the role files in `knowledge/agents/` are that knowledge base.

# Crew Workers: the factory rulebook

A Minecraft Bedrock add-on of worker mobs, built by a small "software factory" of Claude sessions
with Brian as product owner. Owner: Brian, who hosts a Bedrock Dedicated Server (BDS) for friends.

Start here. This file is the rulebook; read the rest only as your task needs it:
- `docs/FACTORY_PLAN.md`: why the factory works this way, the roles, the test layers, the V1 schedule.
- `specs/`: one spec per feature. **A builder session starts with one spec and nothing else.**
- `docs/PLAN.md`: full plan, job spec, architecture, LLM bridge design, release roadmap.
- `docs/QA.md`: the in-game test list. `CHANGELOG.md`: what players will notice.
- `README.md`: install, player guide, test steps.

## The goal, in two steps
1. **Deterministic workers (now):** worker mobs that do jobs like vanilla mobs do: strip-mine a
   marked area, store what they dig in a chest, later haul to a named depot ("blue base") and report
   finds such as abandoned structures. Same input, same result, every time.
2. **LLM "general contractor" (later):** players give orders in plain words in game, an LLM turns them
   into the same job calls. Runs on BDS (console bridge first, `@minecraft/server-net` maybe later).
   Brian's rule: "Build it with the LLM in mind but it should work without it to start."

So: every job is a typed, validated order (`catalog.js` -> `orders.js`). Slash commands, the menu and
a future LLM bridge all produce the same `{by, worker, job, params}` object. The LLM never pathfinds
or decides block logic; it only picks jobs and fills parameters.

## Factory rules (hard rules: no exceptions without Brian's OK)

1. **`main` is always playable.** Anything merged to `main` loads in a world, passes the mock tests
   and could be released tonight. No half-built features on `main`: unfinished work stays on its
   branch.
2. **Every feature lives on `feat/<name>` in its own worktree.** Start one with
   `claude --worktree <name>` (creates `.claude/worktrees/<name>/` on a new branch; resume with
   `claude --worktree <name> --resume`). Name the branch `feat/<name>` after the spec
   (`specs/<name>.md`). Fixes use `fix/<name>`. Never build features directly on `main`.
3. **Merge only when all of these hold:**
   - the mock tests pass (`node tools/sim/run.mjs`, exit 0) on the branch, rebased on current `main`;
   - the `reviewer` subagent has checked the branch's diff against **every** done criterion in its spec
     and signed off (no open gaps);
   - the scenario tests named in the spec pass on staging (once staging exists, see FACTORY_PLAN);
   - `CHANGELOG.md` and `docs/QA.md` are updated on the same branch (rule 6).
   Brian approves the weekly release, not each branch.
4. **Never change pack UUIDs or the `crew:` namespace.** Old saves lose their workers. The UUIDs
   are fixed forever:
   - BP header `45c91f8b-1a45-49e5-b41a-0c8206b5596c`, BP data module `b8a8b639-58e4-449f-8a1d-d0a9754b47d5`,
     BP script module `948413df-23c4-431d-86b1-02762a60f5d8`
   - RP header `b077ee39-0d38-4590-9be0-8dd5396dbf7b`, RP resources module `a9c40f35-11fd-46ea-ab04-5a5070c993f4`
   - Entity, item, block, command and dynamic property ids keep the `crew:` prefix and never get
     renamed. A save-format change needs a one-time migration (like `migrateRole`) and a mock test
     that loads the old format.
5. **Every new Script API call gets a mock in `tools/sim/mock`** (`@minecraft/server` or
   `@minecraft/server-ui`) in the same branch, so the mock tests exercise it. A call the mock doesn't
   know is a test gap, not a shortcut.
6. **Update `CHANGELOG.md` ("Unreleased") and `docs/QA.md` ("Next release") in the same branch**
   as the change: a changelog line for anything a player would notice, and an in-game check for it.
   If players see it, update `crew_bp/scripts/guide_pages.js` too, then `node tools/make_guide.mjs`.
7. **Stable Script APIs only in the shipped packs:** `@minecraft/server` 2.2.0 and
   `@minecraft/server-ui` 2.0.0, no beta modules, no experiment toggles. GameTest and any test pack
   stay out of `crew_bp`/`crew_rp` and never go on the live server.
8. **Specs first.** No builder starts without a spec whose status is `ready` (Brian has answered its
   open questions). A builder never fills a gap in a spec with a guess: it asks, or writes the
   question into the spec's Open questions and stops on that part.
9. **Two builders at most, never in the same files.** Each spec lists the files it touches; two
   builders never work in the same file (especially `runner.js`) the same week. Rebase on `main` daily.
10. **The server is Brian's.** Never copy anything to the live server or reload it without Brian's
    OK for that update, and back it up first (see "Servers" below).
11. **No personal information in the repo** (Brian, Nov 16). Nothing committed may contain: IP
    addresses other than `127.0.0.1`, locations or travel plans (where or when anyone is away),
    email addresses, phone numbers, Xbox ids (xuids) or gamertags, real names other than "Brian",
    friends' names, Windows user-folder paths (`C:\Users\<name>`), passwords, keys or tokens.
    Server files that hold these (`server.properties`, `allowlist.json`, `permissions.json`,
    worlds, logs) stay out of the repo. Write "Brian", "a friend", "the live server" instead. If
    something personal was committed, tell Brian rather than quietly rewriting history.

## Who does what

| Role | What it does | How it runs |
| --- | --- | --- |
| Brian (product owner) | Approves specs, answers open questions, playtests the weekly build, approves releases | About 4 hours a week |
| Lead session | Writes specs, keeps the roadmap, merges branches, builds the weekly release | Claude session on `main` |
| Builder A / B | Builds one spec on `feat/<name>` | `claude --worktree <name>` |
| `reviewer` subagent | Checks a branch's diff against its spec's done criteria; lists gaps and unclear code | `.claude/agents/reviewer.md` (read-only + tests) |
| `test-writer` subagent | Writes mock tests from a spec's done criteria, before the code | `.claude/agents/test-writer.md` |

## Branch flow, step by step
1. Lead writes `specs/<name>.md` from `specs/_TEMPLATE.md` (status `draft`); Brian answers its open
   questions; status becomes `ready`.
2. Builder: `claude --worktree <name>`, branch `feat/<name>`, status `building`. First the
   `test-writer` subagent turns the done criteria into mock tests (they fail at first), then the code.
3. Builder keeps the mock tests green (the hooks below run them on every edit), adds mocks for new
   APIs, updates CHANGELOG, QA.md and the guide. Status `in review`.
4. `reviewer` subagent reviews the diff against the spec. Fix every gap it lists, then review again.
5. Lead rebases on `main`, runs the tests, merges, deletes the worktree. Status `shipped` once released.
6. Once a week the lead builds the release candidate (`v0.x.y-rc`) for staging, then Brian's
   playtest, then the release (FACTORY_PLAN "Staging vs live").

## Tests
- **Mock tests (layer 1):** `node tools/sim/run.mjs` (Node 18+, no installs; works on Windows).
  `sh tools/sim/run.sh` runs the same list where `sh` exists (it calls `run.mjs`). About 2 seconds.
  Exit code 0 means every test ran without failing. Each test also prints JSON; check `missing`,
  `extraDug`, `leftInBox`, `shortcutsTaken`.
- **Known gap:** only `roles_test.mjs` exits non-zero on a wrong result; the older tests only fail
  when they crash and print their numbers for a person to read. New tests must exit non-zero on a
  wrong result (the `test-writer` subagent does this); the older ones should be converted.
- **Hooks** (`.claude/settings.json`, script `tools/hooks/test_hook.mjs`): after every Edit/Write the
  mock tests run and failures come back to Claude; a session can't end while they fail (Claude Code
  lets a Stop hook block at most a few times in a row, so it can't loop forever).
- **Adding a test:** a `*_test.mjs` in `tools/sim/` plus a line in the `steps` list in `run.mjs`.
  Running one test alone needs a workspace like `run.mjs` builds (mock in
  `node_modules/@minecraft`, scripts in `scripts/`).
- **Scenario tests on staging (layer 2):** not built yet; FACTORY_PLAN "Layer 2" (a stable-API test
  pack printing `[Crew-Test] PASS/FAIL` lines). Never installed on the live server.
- **Type-check (optional):** in a scratch folder `npm i typescript @minecraft/server@2.2.0 @minecraft/server-ui@2.0.0`,
  then `tsc --allowJs --checkJs --noEmit` over `crew_bp/scripts/*.js` (strict, ES2022, bundler resolution).

## Build, version and release
- **Version bump:** `python tools/bump_version.py 0.4.1` sets the version in both manifests (header,
  modules, the BP's dependency on the RP) and `VERSION` in `crew_bp/scripts/util.js`, together.
  `python tools/bump_version.py --check` fails if they disagree. Never edit the versions by hand.
- **Build (the one build command):** `python tools/build.py` checks the three versions agree, runs
  the mock tests, and writes `dist/crew-addon-<version>.mcaddon` (the same files always give the
  same zip). It bumps nothing. `--skip-tests` for a quick local package.
- **Release:** `node tools/release.mjs X.Y.Z` with a clean tree: bump (via `bump_version.py`),
  turns CHANGELOG "Unreleased" into that version, regenerates the guide, builds (via `build.py`),
  commits and tags `vX.Y.Z`. `--build-only` bumps and builds without git. Every server update needs
  a new version, or players keep their cached old resource pack.
- Python 3 (stdlib only) runs the build scripts; on Windows the command is `python` (or `py`).
  `release.mjs` finds it (or set `CREW_PYTHON` to a python.exe). **Brian's PC has no Python yet**
  (Nov 16; only the Microsoft Store stub): install it before the next release
  (`winget install Python.Python.3.12`).
- **Install to a local world:** double-click the .mcaddon (Windows) or copy the folders into
  `development_behavior_packs` / `development_resource_packs` of your Minecraft data folder, then
  activate both packs on the world. `/reload` only reloads scripts; model, texture or
  `entities/worker.json` changes need Minecraft fully restarted.

## Servers
- **Live server (Brian's rule, Nov 14):** never copy changes to it or reload it without Brian's OK for
  that update. Back up first. It's `C:\MinecraftServer` (since Nov 15), running headless from the
  "Minecraft Bedrock Server" scheduled task: stop with its `stop-server.bat`, start again with
  `Start-ScheduledTask 'Minecraft Bedrock Server'` as admin, output in its `logs\server.log`.
  Script-only changes can go out with `reload` (via `server-command.bat`); a change to a slash
  command's options needs a full restart.
- **Staging server (set up Nov 16):** `C:\MinecraftServer-staging`, port 19134 (live is 19132), a
  copy of the live world from a daily backup, the release candidate packs from `main`. Allow-list
  (Brian only), cheats on, LAN visibility off, `server-udp-ports` empty (live's public UDP
  mapping must stay live's). Runs as Brian's user, not at boot: `start-server.bat` (hidden:
  `Start-Process cmd.exe -ArgumentList '/c','"C:\MinecraftServer-staging\start-server.bat"' -WindowStyle Hidden`),
  `stop-server.bat` and `server-command.bat` in that folder only ever touch staging; log in its
  `logs\server.log`. **Claude may install new builds on staging and restart it without asking**
  (Brian, Nov 16). Copying anything from staging to the live server still needs his OK. Details
  in its `STAGING-README.txt`. Join: Add Server, 127.0.0.1, port 19134. The test pack
  (FACTORY_PLAN layer 2) goes here only.
- **Install to BDS:** README "Install on Bedrock Dedicated Server" (pack UUIDs and
  `world_behavior_packs.json` / `world_resource_packs.json`, `texturepack-required=true`).
- In game, watch the console for `[Crew] v<version> loaded`, `[Crew-Event]` lines and script errors.

## Keeping others in sync
- **Shared roadmap (Brian, Nov 14):** every roadmap change in `docs/PLAN.md` also goes into the
  Google Doc "Crew Workers Roadmap" that friends read (edit in place, same link, player wording, no
  dates). Friends' comments there are shown to Brian and folded into the plan only after his OK.
- **Sync snapshot (Brian, Nov 15):** Brian's Claude Duet channel reads Google Drive folder "Crew Addon
  Sync". After every meaningful change (commit, server push, release, QA results, roadmap change)
  refresh both: upload `crew-addon-source-<commit>.zip` (`git archive --format=zip
  --prefix=crew-addon/ <commit>`: tracked files only, no worlds or builds) and update the Google Doc
  "Crew Addon Status" in place. Never change game code for it.
- **Git:** private GitHub repo `origin` (see `git remote -v`), branch `main`, releases
  are tags `vX.Y.Z`. Git for Windows is `C:\Program Files\Git\cmd\git.exe` (may not be on PATH in an
  old shell). Commit work as it lands.

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
| 21 | Every Survey Stake menu has "Put the stake away" (removes it from the inventory; the plan is kept). The worker menu has "Get a Survey Stake" (and the "no plan yet" message offers one); only one per player, `/crew:stake` follows the same rule | Brian, Nov 12 |
| 22 | Stopping (or Drop off / Come here) keeps an unfinished quarry or branch mine as paused (`crew:paused`, with its step and queue); "Continue" in the menu, `/crew:continue` or the `resume` job picks it up where it left off. A new dig order replaces it | Brian, Nov 12: "restart from the start" was the only option |
| 23 | v0.4 living workers: a home (claimed bed, one worker per bed, + home chest within 8), dusk-to-dawn sleep (dig paused and auto-resumed), energy drained by digging and restored by sleep and optional food, morning restock of torches, food and tools from the home chest; no home = sleep rough in place | Brian, Nov 13 roadmap |
| 24 | The Survey Stake is the remote: tap a worker to link it (`crew:linked` on the player); then a bed = its home (any distance), a chest = home chest / drop-off / named place, the ground = plan a dig (offers to start it with the linked worker), the air = its orders, your plan, link another. Works while the worker's area is loaded | Brian, Nov 13: setting a far bed meant standing by it with the worker's menu open; asked for one device to manage workers |
| 25 | Workers keep everything they dig by default (`keep` default `all`), with 36 inventory slots like a player (kit in 0-4); night is dusk 12000 to dawn 23000 | Brian, Nov 13: chest looked empty; worker went to bed at dawn |
| 26 | Quarry "Clear above" (`clear_above`; on by default from the stake, off by default for raw orders): measured at plan and at start (`blocks.js layersAbove`: up to open sky, 3 empty layers in a row; refused past 48), cleared top down as `pre` steps before the quarry's own; the worker reaches up from the ground (never climbs onto what it clears) | Brian, Nov 14: "no floating blocks above the quarry area" |
| 27 | Workers walk through wooden doors and fence gates (open, step through, close behind; iron only if open) and never break doors, gates or trapdoors | Brian, Nov 14 |
| 28 | A sleeping worker's menu opens (crouch-tap it or its bed) without waking it; "Wake up" or any order wakes it; woken at night it stays up while busy and returns to bed after 60 s idle (`crew:stayUp`) | Brian, Nov 14 |
| 29 | Tools menu setting: "Save my best tools" (default) or "Use the fastest tool" (`crew:toolPref`, `chooseTool` prefer) | Brian, Nov 14 |
| 30 | No Fast pace: player speed only. The mock tests' 5x speed-up is `globalThis.crewTestFast`, set by the mock, not an order param | Brian, Nov 14 |
| 31 | Workers dig only what they can see (`canSee` line of sight) and walk (never teleport) to a spot with a view; an `unstick` safety net logs `[Crew-Inside]` and steps out if one is ever inside a block | Brian, Nov 14: passed through a quarry stair |
| 32 | Two digging roles with a **hard split** (built Nov 15): Digger (shovel) takes `quarry` and later earthworks; Miner (pickaxe) takes `prospect` (v0.6) and inherits every Prospector decision (there's no separate Prospector worker). `branch_mine` is no longer an order: kept hidden (`catalog.js hidden`) for prospecting to build on. Each refuses the other's orders; come, stop, resume, status, drop off and home stay open to all. Role at build = first tool's kind. Workers from before the split became Diggers once (`migrateRole`) | Brian, Nov 15: "we are still testing so I'd rather make a hard split between the roles and the orders they can take"; "convert them to diggers now and remove the branch mine option" |
| 33 | The repo is run as a software factory: specs, one worktree per feature, reviewer subagent, test hooks, one build command (`docs/FACTORY_PLAN.md`) | Brian, Nov 16 |

## Current state (v0.4.0, released Nov 14 2026)
- Last release: 0.4.0 (tag `v0.4.0`, `dist/crew-addon-0.4.0.mcaddon`); v0.3 and v0.4 shipped together.
  Earlier: tag `v0.2.0` (the hand-off). README and `docs/PLAN.md` describe it.
- Unreleased on `main` (for 0.4.1): see CHANGELOG "Unreleased". The live server runs everything up to
  the light-block and chest fix (commit 3723a50); the Digger/Miner split (8fb73ef) is only in the
  local "Addon Test" world, waiting for Brian's OK and QA Run D.
- Digging: break time = tool speed (+Efficiency) over block hardness (`blocks.js hardness`), like a
  player; the block breaks at the end of the swing. Steps ease in and out at about a villager's pace.
- Jobs: `quarry` (alias `mine_area`; Digger only), `branch_mine` (hidden since Nov 15, Miner only, internal orders), `come`, `stop`, `resume`, `status`, `drop_off`,
  `set_home`, `clear_home`; plus the internal `rest` job the routine starts at dusk or when worn out.
- Kit in worker slots 0-4, carrying in 5-35 (36 slots, like a player). Deterministic Unbreaking (wear every N+1 uses); warns at 10%.
- Skipped blocks go to the `crew:skipped` dynamic property and the status text; branch U-detour.
- Crouch menu (`ui.js openMenu`), tap-to-give (`ui.js giveHeldTool`, wired in `main.js`), stake planner
  (`marker.js`), A* walking (`path.js`), moving ticking area per working worker.
- **Tested in game** (local "Addon Test" world, Nov 12-14; live server from Nov 14): see `docs/QA.md`
  for what's ticked and what's open.
- **Next:** FACTORY_PLAN week 1 (staging server, test spike, QA Run D), then the settlement layer and
  Hauler specs. Open fix: close doors that were already open (PLAN "Next fixes").

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
V1 (by Dec 31, FACTORY_PLAN "V1 scope and schedule"): settlement layer, Hauler, Woodcutter and Farmer,
Miner prospecting, Sifter, with the cut line there. January: the Smith, Builder, LLM orders. The
older release roadmap with task lists is in `docs/PLAN.md` ("Roadmap"); where the two disagree on
order, FACTORY_PLAN is newer (Nov 16) and PLAN.md's roadmap still needs updating with Brian.

## Layout
- `crew_bp/` behavior pack. `scripts/main.js` is the entry. `workers.js` spawn, kit, ownership;
  `runner.js` job loop, daily routine and `rest` job; `life.js` home, beds, energy, food, restock;
  `plans.js` quarry and branch geometry; `path.js` A*; `tools.js` tiers, wear, kit; `blocks.js` block
  tiers and best tool kind; `catalog.js` job schema; `orders.js` dispatcher; `ui.js` + `forms.js`
  menus; `marker.js` Survey Stake; `commands.js` slash commands; `store.js` persistence (places);
  `util.js` helpers and `VERSION`. `entities/worker.json`, `items/`, `recipes/survey_stake.json`.
- `crew_rp/` resource pack (model, textures, lang).
- Player guide: `crew_bp/scripts/guide_pages.js` is the one source for the in-game guide (`/crew:guide`,
  "How workers work" in menus, one-time welcome line; `guide.js`) and `PLAYER_GUIDE.md`
  (`node tools/make_guide.mjs`). **Update the pages whenever a feature a player sees changes,** then regenerate.
- `specs/` feature specs (`_TEMPLATE.md` to start one).
- `.claude/agents/` the `reviewer` and `test-writer` subagents; `.claude/settings.json` the test hooks
  (`tools/hooks/test_hook.mjs`). Other `.claude/` contents (worktrees, local settings) aren't tracked.
- `tools/sim/` mock `@minecraft/server` + tests (`run.mjs`). `tools/build.py` build,
  `tools/bump_version.py` version, `tools/release.mjs` release, `tools/make_guide.mjs` guide,
  `node tools/make_textures.mjs [previewDir]` redraws the role skins, stake and icons.
