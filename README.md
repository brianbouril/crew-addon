# Crew Workers v0.2 (Minecraft Bedrock add-on)

Small worker mobs that run deterministic jobs. v0.2 adds two mining patterns (quarry and branch
mine), tool kits that set what a worker can mine and how fast, a crouch menu for giving orders,
and the Survey Stake planner with a particle outline. Every job is still a typed order, so an LLM
can drive the same jobs later (see the plan doc).

- `PLAYER_GUIDE.md`: the guide for players (also in game: `/crew:help`). Share this with friends.
- `CLAUDE.md`: start here if you're picking up development (goal, decisions, state, what's left).
- `docs/PLAN.md`: full plan, job spec, architecture and LLM bridge design.
- `dist/crew-addon-X.Y.Z.mcaddon`: the installable add-on (behavior pack + resource pack), made by
  `node tools/release.mjs X.Y.Z`. `CHANGELOG.md` says what's in each version.
- `crew_bp/`, `crew_rp/`: source. Scripts are plain JavaScript in `crew_bp/scripts/`.
- `tools/release.mjs`: tests, sets the version, builds the .mcaddon, commits and tags a release.
  `tools/make_textures.mjs`: redraws the textures. `tools/make_guide.mjs`: rebuilds `PLAYER_GUIDE.md`.
- `tools/sim/run.sh`: runs the job logic against a mock world in Node (no Minecraft needed).

Targets `@minecraft/server` 2.2.0 and `@minecraft/server-ui` 2.0.0 (both stable). No experiments,
no cheats needed.

## Install on Bedrock Dedicated Server

1. Stop the server.
2. Unzip `dist/crew-addon-X.Y.Z.mcaddon` (or copy the `crew_bp` and `crew_rp` folders directly). Inside are `crew_bp.mcpack` and `crew_rp.mcpack`; unzip each:
   - `crew_bp.mcpack` -> `bedrock_server/behavior_packs/crew_bp/`
   - `crew_rp.mcpack` -> `bedrock_server/resource_packs/crew_rp/`
   (Upgrading from v0.1: delete the old `crew_bp` and `crew_rp` folders first.)
3. In `bedrock_server/worlds/<level-name>/` add (or extend) two files:
   - `world_behavior_packs.json`: `[{"pack_id": "45c91f8b-1a45-49e5-b41a-0c8206b5596c", "version": [X, Y, Z]}]`
   - `world_resource_packs.json`: `[{"pack_id": "b077ee39-0d38-4590-9be0-8dd5396dbf7b", "version": [X, Y, Z]}]`
4. In `server.properties` set `texturepack-required=true`.
5. Start the server. The console should show `[Crew] v0.2.0 loaded` and a `[Crew-Schema]` line.
   If it says a script module version isn't available, update BDS to the latest release.
6. In the console: `op <your gamertag>` (only needed for the debug `/crew:hire`).

To test on a single-player world first instead: double-click the .mcaddon on Windows (or open it
on mobile), create a world, and activate both packs in the world's settings.

## How it works

**Building a worker.** Put one to five tools in a barrel, then place a carved pumpkin on top of the
barrel. The two blocks turn into a worker that carries those tools. No iron block. The tools set:
- **Role:** the kind of the best tool (pickaxe = Miner, shovel = Digger, axe = Woodcutter, hoe = Farmer).
  Only the Miner has jobs in v0.2; the others are placeholders. You can change the role in the menu.
- **What it can mine:** vanilla rules. Stone pickaxe for iron ore, iron for diamond, diamond for obsidian.
- **Speed:** wood is slowest, then stone, copper, iron, diamond, netherite; gold is fast but weak.
  Efficiency speeds it up. Tools wear out like yours do (Unbreaking helps) and the worker warns at 10% left.

Per block it uses the best tool kind (shovel for dirt and gravel, pickaxe for stone and ores) at the
lowest tier that can harvest it, so the good pickaxe is saved for ore. When a tool breaks it switches
to the next. If no tool left can carry on, it walks back to the drop-off chest and waits for one.

**Handing it more tools.** Hold a tool and tap the worker (no crouch). It goes into the worker's kit
(5 tools at most). Only the owner, the players they allow and server operators can do this.

**Torches.** Put torches in the barrel when you build it, or hold torches and tap the worker. It
places them as it digs (every 12 blocks of tunnel, every 10 in the wide trunk, on quarry stair
steps) so every tunnel block stays lit enough that monsters can't spawn. It tells you when it runs out.
Torches stay with the worker; they never go into the chest.

**The worker menu.** Crouch and tap the worker (or `/crew:menu <name>`), whatever you're holding.
Players who can't give it orders see its status only. Everyone allowed gets: Quarry, Branch mine,
Come here, Stop (stop here, or stop and drop off), Continue (after a stop or drop-off it picks the
dig up where it left off; also `/crew:continue <worker>`), Take what it carries, Drop off at a chest, and
Tools (see each tool's uses left, add the one in your hand). The owner and server operators also get:
Role, Name, Who can give orders (allow or remove players), Take back a tool, and Dismiss.

**The Survey Stake.** Pick "Get a Survey Stake" in a worker's menu, craft it (string on top of two
sticks in a column) or use `/crew:stake`. You only get one if you don't already carry one.
- Tap a block to start a plan there. The direction you face is the direction it digs. Pick Quarry
  or Branch mine, then set the size with sliders.
- While you hold the stake, a white particle outline shows the plan and flame particles show the
  direction. Tap the same block again for: Confirm, Change the size, Point it another way, Switch mode, Clear.
  Once confirmed the outline turns green.
- Tap a chest with the stake to make it the drop-off chest.
- Every stake menu has "Put the stake away" to take it out of your inventory (your plan is kept).

**Quarry.** Digs a box top-down in rows, starting at the corner you staked and heading the way you
faced. It leaves a staircase in the wall, spiralling down clockwise, so you and the worker can walk
in and out. Max 128 on each side.

**Branch mine.** From the staked block it digs a staircase down to the Y level you set (default -54,
good for diamonds), then a trunk 2 tall and 1 to 4 wide (default 2; extra lanes go to the right). Branches 1 wide and 2 tall go off both sides,
with **2 solid blocks between neighbouring branches** (editable 1 to 16). Default trunk and branch
length are 32. It mines the far branches first and works back toward the stairs. Ore showing in
the tunnel walls (and the rest of its vein) is mined too, and each hole is filled back with stone
or dirt so the walls stay solid.

**Blocks it can't harvest.** If none of its tools can harvest a block (obsidian with only iron
pickaxes, say), it leaves the block and digs around it rather than wasting it. In a branch it digs a
small U around the block and carries on. Each skipped block is logged with its position and type,
and the status in the menu shows the count by type (for a later "collect what was skipped" job).

**Other rules.** Liquids, spawners, signs and chests with items in them are left and reported. Lava
is reported. Drops go into its 22 hauling slots; when full it walks to the drop-off chest. A moving
ticking area keeps it working when nobody is near (the world allows 10 ticking areas in total).
Dismissing a worker gives back its tools, what it carries, the barrel and the pumpkin.

## Test steps (about 15 minutes)

1. **Load check:** join, type `/crew:` and confirm the commands autocomplete. `/crew:jobs` lists the jobs.
2. **Build a worker:** place a barrel, put a stone pickaxe and an iron pickaxe in it, close it, then
   place a carved pumpkin on top. A worker in a hard hat appears; its name tag shows "Miner, Iron Pickaxe".
   (Debug shortcut for operators: `/crew:hire Digby` gives an iron pickaxe and an iron shovel.)
3. **Give it a tool:** hold an iron shovel and tap the worker. Chat confirms and lists its tools.
4. **Plan a quarry:** `/crew:stake`, tap a chest (drop-off), then tap the ground where the dig should
   start, facing the way it should go. Pick Quarry, set 8 x 8 x 6. Check the white outline, tap the
   same block again and pick Confirm (outline goes green).
5. **Start it from the menu:** crouch and tap the worker, pick Quarry, choose Pace: Fast, submit.
   Watch it walk to the corner, dig in rows, and leave a stair in the wall. Walk down the stair yourself.
6. **Plan a branch mine:** tap a new spot with the stake, pick Branch mine, set target Y about 20 below
   you, trunk 12, branch 6, spacing 2. Confirm, then start it from the menu. Check the 2 solid blocks
   between branches when it's done.
7. **Skip check:** put an obsidian block in the path of a worker with only iron or stone pickaxes.
   It should dig around it, and the menu status should say it left 1 obsidian.
8. **Permissions:** have a friend crouch-tap your worker (status only) and tap it holding a tool
   (refused). Add them under Who can give orders and try again (works).
9. **Restart:** stop the server mid-dig and start it again. The job resumes.
10. **Console seam:** in the server console run
    `crew:exec {"by":"<your gamertag>","worker":"Digby","job":"status","params":{}}`
    and look for a `[Crew-Result]` line.

## Slash commands

`/crew:menu`, `/crew:stake`, `/crew:mine <worker> [drop-off] [keep] [pace]` (runs the confirmed stake
plan), `/crew:minebox` (quarry by two corners), `/crew:come`, `/crew:stop`, `/crew:status`,
`/crew:list`, `/crew:allow`, `/crew:deny`, `/crew:crew`, `/crew:rename`, `/crew:dismiss`,
`/crew:place`, `/crew:places`, `/crew:forget`, `/crew:jobs`, `/crew:hire` (operators), `/crew:exec` (console).

## Known limits in v0.2

- Movement is scripted (a simple pathfinder plus gliding), not vanilla AI. If it can't find a route
  it "blinks" to the target once and says so.
- Particles don't show through rock, so a branch plan is drawn as a flat map just above the staked block.
- A block it can't harvest that sits exactly on a quarry stair step can break that stair; it blinks past.
- Falling gravel and sand are re-mined when seen, but not perfectly.
- Drops come from the game's own loot rules for the tool used; Silk Touch and Fortune are not checked in game.
- A dig around a skipped block in a branch can cut into the 2-block wall next to it for 3 blocks.
- The Woodcutter, Digger and Farmer roles have no jobs yet.

## What was and wasn't tested

Tested here: the scripts type-check against the official `@minecraft/server` 2.2.0 and
`@minecraft/server-ui` 2.0.0 typings, and the job logic runs end to end in a mock world:
- Quarry 12 x 10 x 10: 1,200 blocks, the stair is solid with headroom, only the obsidian and
  spawner are left, nothing outside the box changes, shovel used on dirt and pickaxe on stone.
- Branch mine (20 trunk, 8-block branches, spacing 2): every planned cell is open, exactly 2 solid
  blocks between branches, the obsidian is left and dug around, the diamond is reported.
- Tool kit: tools wear out in order, the worker waits at the chest, and carries on after a tool is
  handed over; a player who isn't allowed is refused.
- Permissions and resume after unload.

Not tested: anything in a real Minecraft client or BDS (no game here). The parts most likely to need
a tweak on first run are the menus and sliders, the particle outline, the crouch and tool-tap
interactions, the model look, and the exact chat text.
