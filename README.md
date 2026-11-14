# Crew Workers v0.4 (Minecraft Bedrock add-on)

Worker mobs that live in your world and run deterministic jobs. Build one from a barrel of tools
and a carved pumpkin; it strip-mines or quarries the area you stake out, keeps everything it digs
(36 slots, like a player), lights its tunnels, drops off at your chest, and lives by the day: it
goes home to its own bed at dusk and gets back to work in the morning. Every job is a typed order,
so an LLM can drive the same jobs later (see the plan doc).

- `PLAYER_GUIDE.md`: the guide for players (also in game: `/crew:help`). Share this with friends.
- `CHANGELOG.md`: what's in each version.
- `CLAUDE.md`: start here if you're picking up development (goal, decisions, state, what's left).
- `docs/PLAN.md`: full plan, roadmap, job spec, architecture and LLM bridge design.
- `dist/crew-addon-X.Y.Z.mcaddon`: the installable add-on (behavior pack + resource pack), made by
  `node tools/release.mjs X.Y.Z`.
- `crew_bp/`, `crew_rp/`: source. Scripts are plain JavaScript in `crew_bp/scripts/`.
- `tools/release.mjs`: tests, sets the version, builds the .mcaddon, commits and tags a release.
  `tools/make_textures.mjs`: redraws the textures. `tools/make_guide.mjs`: rebuilds `PLAYER_GUIDE.md`.
- `tools/sim/run.mjs`: runs the job logic against a mock world in Node (no Minecraft needed).

Targets `@minecraft/server` 2.2.0 and `@minecraft/server-ui` 2.0.0 (both stable). No experiments,
no cheats needed.

## Install on a single-player world (try it first)

Double-click `dist/crew-addon-X.Y.Z.mcaddon` on Windows (or open it on mobile), then in the world's
settings activate both packs (Crew Workers behavior pack and resource pack).

## Install on Bedrock Dedicated Server

1. **Stop the server** and **back up the whole server folder** (copy it somewhere outside the
   server, named by date, e.g. `Minecraft Server Backups\2026-11-14 before Crew Workers 0.4.0`).
   Check the copy has the same number of files. To roll back: stop the server and copy it back.
2. Copy the packs in (replace any older copy completely):
   - `crew_bp` -> `<server>/behavior_packs/crew_bp/`
   - `crew_rp` -> `<server>/resource_packs/crew_rp/`
   (From the .mcaddon instead: it's a zip holding `crew_bp.mcpack` and `crew_rp.mcpack`, each a zip
   of that folder.)
3. In `<server>/worlds/<level-name>/` add one entry to the **end** of each list, keeping the packs
   already there (mind the comma after the previous entry):
   - `world_behavior_packs.json`: `{"pack_id": "45c91f8b-1a45-49e5-b41a-0c8206b5596c", "version": [0, 4, 0]}`
   - `world_resource_packs.json`: `{"pack_id": "b077ee39-0d38-4590-9be0-8dd5396dbf7b", "version": [0, 4, 0]}`
   If a file doesn't exist yet, it's just `[ that entry ]`.
4. In `server.properties`: `texturepack-required=true` (friends download the model and skins when
   they join). Optional: `content-log-file-enabled=true` writes script messages to a log file.
5. Start the server. The console should show `[Crew] v0.4.0 loaded` and a `[Crew-Schema]` line.
   If it says a script module version isn't available, update BDS to the latest release.
6. Optional, in the console: `op <your gamertag>` (needed only for the debug `/crew:hire`; operators
   can also give orders to anyone's worker).

**Updating to a new version:** stop, back up, replace both pack folders, change the `version` in
both list entries to the new number, start. Always use a new version number: players' games keep
their cached resource pack otherwise. Workers, homes and paused jobs carry over (they're saved on the
workers and the world).

## How it works (short version; `PLAYER_GUIDE.md` has the full guide)

**Build a worker.** Put one to five tools in a barrel (plus torches and food if you like), then
place a carved pumpkin on top. It becomes a villager-like worker in a hard hat, owned by you. Tools
set its role (pickaxe = Miner; the shovel, axe and hoe roles have no jobs yet), what it can harvest
(vanilla tiers) and how long each block takes: the same time a player would take with that tool on
that block. It uses the right kind of tool at the lowest tier that works, saving the good pickaxe.

**Talk to it.** Crouch and tap it for its menu: Quarry, Branch mine, Come here, Stop, Continue, Drop
off, Take what it carries, Home, Tools, and for the owner Name, Role, Who can give orders, Dismiss.
Tap it holding a tool or torches to hand them over.

**The Survey Stake is the remote.** Get one from the worker's menu, `/crew:stake`, or craft it
(string over two sticks). Tap a worker to link it, then from any distance:
- tap a **bed**: the worker's home (one worker per bed; says whether the bed is safe)
- tap a **chest**: its home chest, the drop-off for your digs, or a named place
- tap the **ground**, facing the way to dig: plan a Quarry or Branch mine, set the size, check the
  white outline, then tap again (anywhere) and Confirm. It offers to start it with the linked worker.
- tap the **air**: the worker's orders, your plan, link another worker, put the stake away

**Quarry** digs a box top-down and leaves a staircase in the wall. **Branch mine** digs stairs down
to a level (default Y -54), a trunk 1 to 4 wide, and side branches with 2 solid blocks between; it
mines ore veins out of the walls and fills the holes. Blocks no tool can harvest are left and dug
around. Torches go down so nothing spawns in its tunnels.

**Its day.** At dusk it pauses the dig, walks home, unloads into its home chest and sleeps (no home:
it sleeps where it is, less well). At dawn it takes torches, food and spare tools from the home
chest and goes back to the dig where it left off. Digging tires it; sleep or food restores energy.

## Test steps on a fresh world (about 20 minutes)

1. **Load:** type `/crew:` and see the commands; `/crew:help` opens the guide.
2. **Build:** barrel with a stone and an iron pickaxe and some torches, carved pumpkin on top.
3. **Home:** place a bed and a chest under a roof. `/crew:stake`, tap the worker (linked), tap the bed.
4. **Plan and start:** tap the ground facing the way to dig, pick Quarry 8 x 8 x 6, look at the
   outline, tap again, Confirm, Start it with the worker. Watch it dig block by block with the tool in
   hand, and leave a stair. Check its drop-off messages name the chest's position.
5. **Night:** `/time set 13000`. It walks home, unloads and lies down in bed. `/time set 23000`: it
   gets up and goes back to the quarry.
6. **Branch mine:** plan one about 20 blocks down, trunk 12, branch 6. Check 2 solid blocks between
   branches and torches along the tunnels.
7. **Permissions:** a friend crouch-taps your worker (status only), and can't give it tools until
   you add them under Who can give orders.
8. **Restart:** stop the server mid-dig and start it again. The job carries on.

## Slash commands

`/crew:help`, `/crew:stake`, `/crew:menu`, `/crew:list`, `/crew:status`, `/crew:come`, `/crew:stop`,
`/crew:continue`, `/crew:mine <worker> [drop-off] [keep] [pace]` (runs the confirmed stake plan),
`/crew:minebox` (quarry by two corners), `/crew:allow`, `/crew:deny`, `/crew:crew`, `/crew:rename`,
`/crew:dismiss`, `/crew:place`, `/crew:places`, `/crew:forget`, `/crew:jobs`, `/crew:hire` (operators),
`/crew:exec` (console: the LLM seam).

## Known limits

- Movement is scripted gliding along a path at right angles, not vanilla AI (straight-line walking is
  on the roadmap). If it can't find a route it "blinks" there once and says so.
- A worker far from every player keeps working only while a ticking area holds its area loaded (10 per
  world). The stake remote can't reach a worker whose area isn't loaded.
- Particles don't show through rock, so a branch plan is drawn as a flat map above the staked block.
- A block it can't harvest exactly on a quarry stair step can break that stair; it blinks past.
- Falling gravel and sand are re-mined when seen, but not perfectly.
- Silk Touch and Fortune follow the game's own loot rules but haven't been checked in game.
- The Woodcutter, Digger and Farmer roles have no jobs yet.

## Testing status

- Mock world (`node tools/sim/run.mjs`): quarry (fast and normal pace, no position snapping), branch
  mines 1 to 3 wide, tool kits and wear, permissions and resume, drop off, headroom, stop and
  continue, and a full day: home, night, sleep, dawn, food, homeless sleep, bed claims.
- In game on a local world (v0.4.0, Nov 14 2026): all of the above, the stake remote, sleep poses,
  tool in hand and player-speed digging.
- Bedrock Dedicated Server: first install of 0.4.0 Nov 14 2026.
