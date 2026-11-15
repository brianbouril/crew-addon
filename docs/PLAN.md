# Crew add-on: build plan and job spec

This file is the one and only plan. (An older web copy exists on claude.ai from v0.2; it is no
longer updated.) Keep this file current when decisions or job specs change.

## Summary

Crew is a Minecraft Bedrock add-on where small worker mobs run deterministic jobs. Every job is a
typed command that a person, a script or later an LLM can call the same way.

- **Design rule:** the job catalog is the LLM's tool set. The LLM picks a job and fills its
  parameters; it never pathfinds, breaks blocks or decides what counts as "valuable". The add-on
  does all of that, the same way every time.
- **Current build (v0.3, see Roadmap):** workers are built from a barrel holding tools with a carved
  pumpkin on top, and the tools set what they can mine and how fast. Two precise mining jobs
  (`quarry` with a walk-up stair, `branch_mine`), a crouch menu, a Survey Stake that draws the plan,
  torches, ore veins, Continue, and an in-game guide. v0.2 was tested in game; v0.3 additions are
  mock-tested only.
- **Next (v0.4 onward):** living workers with a home, a daily routine, energy, and autonomous goals
  (Prospector), plus a Hauler that consolidates finds to a depot.
- **Target platform:** Bedrock Dedicated Server (BDS) that Brian hosts for friends. Stable APIs only,
  so no experimental toggles.

## What the Script API can and can't do

Checked against the `@minecraft/server` typings (stable 2.11.0, beta 2.13.0) and Microsoft Learn.

| Need | Status | How Crew handles it |
| --- | --- | --- |
| Custom slash commands | Stable since 2.1.0. Registered at startup (`system.beforeEvents.startup`), must be namespaced; callback runs in a "before" context so world changes are deferred with `system.run` | All orders are `/crew:` commands with typed params |
| Reading chat messages | `chatSend` is beta only | Not used. Free-text orders will go through `/crew:ask <worker> "text"` |
| Walk to a coordinate | No script pathfinding call in stable or beta; navigation components are read-only | A small A* pathfinder in the script (step up 1, drop up to 3), run a little each tick. The worker glides along the path and blinks once, with a note, if no route exists |
| Break a block with real drops | `setBlockType` + `LootTableManager.generateLootFromBlock(block, tool)` (stable since 2.2.0) | Drops for the tool actually used go into the worker's inventory |
| Read/write chests | Block and entity inventory containers, `addItem` / `transferItem` | Deposit into a chest or barrel; pause and report if full |
| Persistence | Dynamic properties on world, entity and player | Job, progress cursor, owner, crew list, skipped blocks live on the worker; places live on the world |
| Chunk loading | Scripts only touch loaded chunks; an unloaded worker freezes | A moving ticking area (`tickingarea add circle ... crew_<id>`) follows each working worker. World limit is 10 |
| Tick budget | Watchdog kills hung scripts | Work is spread across ticks; the pathfinder expands at most 150 nodes per tick |
| Structure detection | `getGeneratedStructures` is beta only | Block signatures: spawner, end portal frame, mineshaft rails and webs, loot chests |
| Menus and forms | `@minecraft/server-ui` 2.0.0 (stable): action forms, modal forms with sliders, text fields, dropdowns | The crouch menu and the Survey Stake size forms |
| Outlines in the world | `Player.spawnParticle` (stable) shows particles to one player | Plan outline for the player holding the stake, redrawn every half second, max 300 points |
| HTTP to an LLM | `@minecraft/server-net` works only on BDS; pre-release, so Beta APIs must be on; must be allowed in `permissions.json` | Phase 2. A console bridge avoids beta entirely |

Version choice: Crew targets `@minecraft/server` 2.2.0 and `@minecraft/server-ui` 2.0.0, the oldest
stable versions with everything above, so it loads on any current server.

## Architecture

The LLM is just another input: it sends the same orders a slash command does, and reads the same
events a player sees.

```
 inputs                      core                          world
 ------                      ----                          -----
 /crew: slash commands --+
 crouch menu (ui.js) ----+--> dispatcher (orders.js) --> job engine (runner.js) --> worker entity
 Survey Stake (marker.js)+     validates vs catalog.js      plans.js geometry          blocks, chests
 /crew:exec JSON --------+     (also exports LLM tools)     path.js A*, tools.js
 (console / LLM bridge)                                           |
                                                                  v
                              events: chat to owner + whoever gave the order,
                              and one JSON line on the console: [Crew-Event] {...}
```

- **Entity JSON** (`crew_bp/entities/worker.json`): body, 27-slot inventory, fire and suffocation
  immunity, vanilla wander AI when idle. A `working` state turns off wandering and gravity so the
  script can move it precisely. `minecraft:interact` entries show "Manage worker" (crouching) and
  "Give tool" (holding a tool) buttons on mobile.
- **Job engine** (`runner.js`): one small step per worker per tick. Each step is computed from the
  plan's shape (`plans.js`), so nothing big is stored.
- **Dispatcher** (`orders.js`): the only door in. Validates against `catalog.js`, which also exports
  the LLM tool definitions, printed to the console as `[Crew-Schema]` at startup.
- **Tools, menu, planner** (`tools.js`, `blocks.js`, `ui.js`, `marker.js`): tool kit rules, block
  tiers, the crouch menu and the Survey Stake. The menu builds the same order object a command does.
- **Saved state:** dynamic properties, so jobs resume after a restart or when a chunk reloads.

## Job spec (the command schema)

Every order becomes one object, `{by, worker, job, params}`, checked against the schema before
anything moves.

| Job | Params | What it does | Status |
| --- | --- | --- | --- |
| `quarry` (alias `mine_area`) | a confirmed stake plan, or `from`, `to` (corners) and `facing`; `deposit` (place name or coords), `keep` = valuables / all / nothing, `pace` = normal / fast | Digs the box top-down in serpentine rows from the staked corner, leaving a clockwise stair in the wall. Never touches blocks outside it. Max 128 per side | v0.2 |
| `branch_mine` | `start`, `facing`, `target_y` (default -54), `trunk_length` (32), `trunk_width` (2, 1 to 4), `branch_length` (32), `spacing` (2, 1 to 16), `deposit`, `keep`, `pace` | Stairs down to `target_y`, a `trunk_width`-wide trunk (extra lanes to the right), 1-wide branches on both sides with `spacing` solid blocks between them, far end first | v0.2 |
| `come` | `to` (a player) | Walks to the player and waits | v0.1 |
| `stop` | none | Finishes the current block, saves progress, goes idle | v0.1 |
| `resume` | none | Continues the paused quarry or branch mine (kept when it was stopped, sent to drop off, or called over) from the step where it stopped | v0.2+ |
| `drop_off` | `deposit` (optional; defaults to the last chest it used) | Stops any job, carries everything except the tool kit and torches to the chest, goes idle | v0.2+ |
| `status` | none | Job, progress %, phase, blocks it left, items carried, tools and uses left | v0.2 |
| `collect_skipped` | `job` (default: last) | Goes back for blocks a job left because no tool could harvest them, once it has a better tool | Planned |
| `haul` | `from`, `to` (places), `items` (optional filter) | Moves chest contents between named places, e.g. to "blue base" | Planned |
| `scout` | `area`, `report` = structures / ores | Walks a box and reports finds without digging | Planned |

### Branch mine layout

"Two solid blocks between branches" means a branch, two blocks of rock, then the next branch, so
branches sit every 3rd block along the trunk. Every block in those walls touches a tunnel.

- **Stairs:** 1 wide, 3 blocks of headroom, one step down per block forward, to `target_y`.
- **Trunk:** `trunk_width` wide (default 2; the stair lane plus lanes to its right), 2 tall,
  `trunk_length` long, straight ahead.
- **Branches:** 1 wide, 2 tall, `branch_length` long, off both sides. First pair at trunk index
  `spacing`, then one pair every `spacing + 1` blocks.
- **Order:** trunk to the far end, then branches pair by pair back toward the stairs.
- **Example (test case):** trunk 20, branches 8, spacing 2 = 6 branch positions, 12 branches, 254 steps.

### Quarry layout

- The staked block is the top corner; length runs the way you face, width to your right, depth down.
- Rows are serpentine, top layer first.
- The stair is the wall ring walked clockwise from the anchor, one block down per step
  (`stairBlock(k)` = ring cell k at top-1-k). Stair blocks are kept, and patched with cobblestone if
  they're air or a gravity block.

### Tool kit

- **Size:** up to 5 tools, worker inventory slots 0 to 4. Slots 5 to 26 carry what it digs.
- **Harvest tiers (vanilla):** wood and gold 0, stone and copper 1, iron 2, diamond 3, netherite 4.
  Iron, copper and lapis ore need 1; gold, diamond, emerald and redstone ore need 2; obsidian,
  crying obsidian and ancient debris need 3.
- **Speed (ticks per block, normal pace):** gold 3, netherite 4, diamond 5, iron 6, copper 7, stone 8,
  wood 10, bare hand 12. Efficiency subtracts its level. Fast pace = max(1, round(base / 5)).
- **Which tool per block:** best kind (shovel for dirt, sand, gravel, clay, snow; axe for wood;
  pickaxe otherwise) at the lowest tier that can harvest it, most worn first. Soft blocks with no
  shovel are dug by hand.
- **Wear:** 1 durability per block; Unbreaking N wears it once every N+1 blocks (deterministic).
  Warns at 10% left. Switches when a tool breaks.
- **Skip and dig around:** if no tool can harvest a block, it's left, logged (type and position) and
  dug around (a U in a branch). With no pickaxe at all, the worker goes to the chest and waits.
- **Role:** from the highest-tier tool, changeable in the menu. Dig jobs need the Miner role.

### Rules every job follows

- **Never mined:** bedrock, barriers, command and structure blocks, end portal frames, spawners, and
  containers holding items. Skipped and reported.
- **Liquids:** left in place. Lava is reported. Workers are fire-immune and don't drown.
- **"Valuables":** ores, raw metals, coal, diamonds, emeralds, lapis, redstone, quartz, amethyst,
  ancient debris. Everything else is voided with `keep = valuables`.
- **Blocks no tool can harvest:** left and dug around, never broken for nothing; logged.
- **Unloaded chunks:** the job pauses and resumes when the worker's chunk loads again.
- **Digging like a player:** one block at a time, each taking the tool's break time, facing it,
  with the dig sound and the tool in its hand. The blocks still to break in a step are saved, so a
  step resumes after a chest trip or restart.
- **Headroom:** if a block its tools can break sits at head height where it needs to stand, it digs
  it out (even just outside a quarry box). Stair steps, containers with items, liquids and
  protected blocks are never removed this way.
- **Standing and moving:** a worker stands only where there's a solid floor and 2 blocks of air.
  It never moves into a block it left; one step over or straight down it slides (over first, then
  down), anything farther it walks by A*. In a quarry it may reach up to 3 blocks instead.
- **Ore in tunnel walls (branch mine):** after each tunnel step, ore touching the tunnel (and ore
  touching that ore, up to 32 blocks) is mined, and each hole is filled with stone or dirt it dug:
  voided junk first (it remembers up to 64), else what it carries. Cells the plan will dig are left alone.
- **Torches:** torches it carries (from the barrel, or tap it holding torches) are placed on the floor
  every 12 blocks of stairs and branch, every 10 in the 2-wide trunk, and on quarry stair steps every
  12. Every tunnel block ends up within 6 blocks of a torch (light 8+), so hostile mobs can't spawn.
  It says when it runs out. Torches never go to the deposit chest.
- **Taking what it carries:** the menu's "Take what it carries" moves everything except the kit and
  torches into the player's inventory; "Drop off at a chest" runs `drop_off`.

### Who can give orders

| Action | Owner | Crew (allowed players) | Server operators | Anyone else |
| --- | --- | --- | --- | --- |
| Give jobs, stop, come, status | Yes | Yes | Yes | No |
| Hand it a tool, menu orders | Yes | Yes | Yes | No (status only) |
| Allow/deny players, rename, role, take back a tool, dismiss | Yes | No | Yes | No |
| Use a place as a deposit | Own + shared | Own + shared | All | Shared only |

The owner and crew list are saved on the worker itself. Places are private unless saved shared.

### Events (what workers report back)

`job_started`, `progress` (every 10%), `deposited`, `deposit_full`, `found` (kind + coords),
`hazard` (lava), `skipped`, `detour`, `tool_low`, `tool_broke`, `tool_needed`, `tool_ok`, `stuck`,
`torches_out`, `job_done` (with `ore_from_walls` and `torches` counts), `job_failed`. Each goes to the owner and whoever gave the order, and is printed to the
server console as `[Crew-Event] {json}`, which is what the LLM bridge will read.

### Building a worker

Put one to five tools in a barrel, then place a carved pumpkin on top. The two blocks become a
worker owned by whoever placed the pumpkin. Tools become the kit, other barrel items go to hauling
slots. A barrel with no tool stays a barrel and chat says to add one. Hold a tool and tap the worker
to give it another; crouch and tap for the menu. `/crew:hire` (operators) spawns one for testing.

## Roadmap

Each release is a group of features that can be tested on its own, in the local "Addon Test" world
first and then on the server. Tasks are listed in build order. Decided Nov 13 2026 with Brian.

**Direction (Nov 13):** move from "jobs with coordinates" to living workers: a worker has a home
(bed + chest), a daily routine like a villager, and a goal it pursues by itself ("prospect for
diamonds around here"). Orders stay small typed objects, so the later LLM contractor uses the same
jobs. Decided: **no x-ray** (workers only know what they uncover); **home every night** (camp beds
near a mine keep the walk short); **food is optional** and, like sleep, restores energy; **mobs
can't hurt workers yet**; Quarry and Branch mine stay as precise jobs.

### Done
- **v0.1 Miner:** one worker, box dig, places, permissions, Survey Stake corners.
- **v0.2 Mining patterns and tools:** quarry with stair, branch mine, tool kits, crouch menu,
  Survey Stake outline. Tested in game Nov 12.
- **v0.3 + v0.4, released together as 0.4.0 (Nov 14):** tested in game on the local world, then
  installed on BDS (server world backed up first). Sections below kept for the record.

### Next fixes (0.4.x patch, from server testing)
- [x] **Doors** (Brian, Nov 14; built Nov 14, works in game on the server): workers treat every door as a wall, so a bed inside a house is
  reached by a "shortcut" teleport. Make wooden doors, fence gates and trapdoors walkable in A*
  (`path.js`, `passable`): open one on arrival, step through, close it behind (keeps mobs out).
  Iron doors and iron trapdoors only when already open (they need redstone). Never break a door,
  gate or trapdoor while digging (`clearableHead`, `mineCell`): add them to the protected set.
  Mock test: a bed in a walled house with a door is reached on foot, no shortcut, door closed after.
- [x] **Out of tools, fetch from a chest** (Brian, Nov 14): it waited at the drop-off and stood on
  the chest, ignoring a pickaxe put in its home chest. Now it takes a tool from the chest it waits at
  or walks to its home chest for one, then goes back to work; chest walks end beside the chest.
- [x] **Quarry "Clear above"** (Brian, Nov 14; works in game): clears hills and trees over the box
  first, so nothing floats. Decision 26.
- [x] **Restarted quarry retraced its steps** (Brian, Nov 14): already-dug cells are skipped without
  walking to them (`restart_test`).
- [x] **Talk to a sleeping worker** (Brian, Nov 14; built Nov 14, mock-tested): crouch-tapping a worker asleep in bed (or
  sleeping rough) opens its menu and it **keeps sleeping**. The menu gets a **Wake up** button
  (it gets up; with a paused dig it goes back to it, like at dawn, with the rest it had so far);
  giving it an order from the menu also wakes it. Opening the menu alone never wakes it, and at
  night the routine must not send a worker you woke straight back to bed: it stays up while
  it has an order, and if it's left idle it goes back to bed after about a minute. Check first in game what happens now: while lying down its hitbox may sit inside the bed,
  so the tap lands on the bed (cancel the bed use, or route a crouch-tap on its claimed bed to the
  worker), and whether the sleep pose changes where the tap registers. The status should say it's
  asleep and when it'll get up.
- [x] **Never pass through blocks** (Brian, Nov 14; built Nov 14: line of sight + unstick safety net; not reproduced in the mock, so watch the log for [Crew-Inside] / [Crew-NoSight]): in a quarry he'd restarted (with Clear above),
  a worker passed through a quarry stair block to dig behind it. Workers must only move through
  open space (decision 14) and only dig blocks they can reach with nothing solid in the way. To
  check: did it glide (one-block moves: `canGlide` only checks headroom when stepping up or down,
  so check the cell it passes too), take a "shortcut" (blink: would say so in chat), or dig the
  block behind the stair from the other side (no line-of-sight check in `mineCell` / `inReach`)?
  Likely from the new "skip dug cells, walk if out of reach" step: the stand it picks (`groundNear`
  with onTop) can be on the far side of a stair. Fix: walk there by A* (never through), add a
  line-of-sight check to reach, and a mock test with a restarted quarry that checks the worker is
  never inside a solid block on any tick.
- [x] **"Use the fastest tool" option** (Brian, Nov 14; built Nov 14): a per-worker setting in its Tools menu,
  saved on the worker: **Save my best tools** (today: lowest tier that harvests, most worn first;
  the default) or **Use the fastest tool** (highest tier of the right kind, then most worn). Applies
  to every job; `chooseTool` takes the preference. Shown in the status. Mock test: with stone +
  diamond pickaxes, stone is dug with diamond only under "fastest". Works in game (Nov 15).
- [x] **Light blocks are not walls** (Brian, Nov 15, server; built Nov 15, mock-tested `chest_test`):
  a dynamic-light add-on places invisible `light_block_N` around the worker; `passable` treated
  them as solid, so A* found no way out of the quarry and it blinked. Now passable like air
  (`blocks.js LIGHT`) and protected from digging.
- [x] **Stop where it can see the chest** (Brian, Nov 15, server; built Nov 15): arriving at a chest
  needed only distance, so it stopped outside a house wall next to a chest inside. `path.js atGoal`
  now also needs line of sight (`canSee`, moved to `blocks.js`); a blink to a chest lands on the
  nearest standable spot that can see it (`landingNear`) instead of rising straight up.
- [ ] **Close doors that were already open** (Brian, Nov 15): today it only closes the wooden doors
  and gates it opened itself (`openDoor` remembers them, `closeDoors` shuts them), so a door left
  open stays open after it walks through. It should close any wooden door or fence gate it walks
  through once it's past, open or not (keeps mobs out). Iron doors stay as they are (redstone).
  Mock test: a house door left open is shut behind the worker.
- [x] **Remove the Fast pace** (Brian, Nov 14; built Nov 14): the 5x "Fast" pace was for early testing. Take it
  out of the start menus, `/crew:mine` and `/crew:minebox`, the catalog (`pace` param) and the
  guide; workers always dig at player speed (old saved jobs with pace "fast" just run normal).
  Keep a speed-up only inside the mock tests (a test-only setting, not an order param), so the
  tests stay quick. Update decision 13 in CLAUDE.md (it says fast pace is open to everyone).

### v0.3 Better digging (released in 0.4.0)
Villager-style model with a skin per role; tool in hand; digs one block at a time; no hovering or
clipping; clears diggable blocks at head height; ore veins in tunnel walls with backfill; torches
at no-spawn spacing; trunk width 1-4; Take what it carries / Drop off / Stop-and-drop-off;
Continue after a stop; Get a Survey Stake from the menu, Put the stake away; in-game guide.
- [ ] Full Minecraft restart, check tool in hand, block-by-block digging, headroom, trunk width.
- [ ] Bump all versions to 0.3.0 (both manifests, module and dependency versions, `VERSION`).
- [ ] Back up the server world; install both packs on BDS; friends test.
- **Gate:** a friend builds a worker from the guide alone and finishes a branch mine on the server.

### v0.4 Home and daily routine (released in 0.4.0)
Built as planned, in `life.js` (home, beds, energy, food, restock) and the `rest` job + `routine()`
in `runner.js`. Differences from the task list below: the name tag doesn't mark a home (the menu
status and Home screen show it); "yawning" is a one-time "getting tired" message, not an
animation; idle workers use vanilla wandering, not tied to their home yet; a worker with no home
sleeps rough where it stands at night (rests to 50%). Numbers: dusk at time 12000; energy drains
0.08 per block (about 1,250 blocks from full); below 30 it digs 1.5x slower and eats if it has
food; below 10 it rests; safe bed restores to 100, unsafe 75, rough 50; it packs 64 torches and
8 food each morning.
1. **Home:** `set_home` job + "Set home" in the menu: claims the bed the player is standing by
   (one worker per bed, claims kept on the world) and the nearest chest within 8 blocks as its
   home chest, which becomes the default drop-off. Name tag shows it has a home.
2. **Safe bed check:** roof over the bed (no open sky above), no hostile mobs within 16 blocks.
   Unsafe beds still work but give less rest, and the worker says why.
3. **Day clock:** read `world.getTimeOfDay()`; phases wake, work, dusk, sleep. Handle time jumps
   (players sleeping skips the night) and restarts.
4. **Routine on top of jobs:** at dusk the current dig is paused (reusing `crew:paused`), the
   worker walks home, unloads, eats if there's food, sleeps; at dawn it takes supplies (tools,
   torches, food) from the home chest and Continues. No job: idles around home (wander, look at
   players, sit).
5. **Energy (0-100):** drops per block mined; below 30 it digs slower, below 10 it heads home.
   Sleep restores it (full in a safe bed, partial in an unsafe one). Food from the home chest or
   carried food restores some too (bread, cooked meat and fish, baked potato, more for better food).
   Food is never required.
6. **Animations:** lying in bed with "Zzz", eating, yawning when tired.
7. Guide pages, mock-clock tests, docs.
- **Gate:** a worker digs all day, walks home at dusk, sleeps, and is back at its dig the next
  morning, across a server restart and a skipped night.

### v0.5 Prospector (autonomous miner)
1. **`prospect` job:** target (diamonds, iron, gold, redstone, lapis, coal, copper, emeralds,
   ancient debris, or any valuables), start (staked spot, "here" or "near home"), range (how far it
   may roam), optional quota ("10 diamonds"), optional mine name.
2. **Target table:** best depth and which blocks count for each target.
3. **Mine entrance:** before digging down, builds an old-style wooden entrance over the stairs (log
   posts, plank beam, a lantern) with a sign naming the mine, e.g. "Digby's Diamond Mine No. 1" or the
   name given. An entrance chest next to it is where it drops off. Signs via the sign component.
4. **Growing branch mine:** stairs to the target depth, then a main tunnel with branches 2 blocks
   apart that keeps extending in a fixed, repeatable pattern until a stop rule; stays within range.
5. **Caves:** when a tunnel breaks into a cave or ravine, it mines the ore it can see and reach
   there, then returns to its tunnel. No x-ray.
6. **Hazards:** seals lava with cobblestone, handles water and falling gravel.
7. **Stop rules:** full: unload at the entrance chest and carry on; out of pickaxes: home, asks for
   tools; quota met or range mined out: home, reports; night: home (v0.4 routine).
8. **Route home:** remembers the way out through its own tunnels, so long commutes don't need big
   path searches.
9. **Finds:** reports structures it breaks into (mineshaft, dungeon, geode, ancient city,
   stronghold) and big ore finds; stats on the sign or in the menu.
10. **Makes its own tools** (Brian, Nov 14): when a tool breaks or wears low and it has no spare,
   a worker with a crafting table within 8 blocks of its bed crafts a replacement at home from
   materials in its home chest, using vanilla recipes (sticks from planks if needed; best tier the
   materials allow, never better than the tool it lost unless the owner allows it). It walks home
   to do it (or does it during the morning restock), says what it made and what it used, and asks
   for materials when it can't. Fits with "out of pickaxes: home, asks for tools" above.
- **Gate:** "prospect for diamonds here, quota 5" runs over several in-game days with no help
  beyond tools, and the entrance and sign look right.

### v0.6 Hauler (new worker)
1. **New worker type** with its own look (backpack, no tool); build recipe to decide (see open
   questions); own menu.
2. **Depot:** a designated spot (a named place like "blue base"); nearby chests count as one depot.
3. **Rounds:** collects from its owner's mine entrance chests (and any pickup points it's given),
   carries to the depot, puts each item in a chest that already holds that item, else any free one.
4. **`haul` job:** one-off move from one place to another, for the LLM and slash commands.
5. Keeps the same daily routine (home, sleep, energy).
- **Gate:** a hauler keeps two prospectors' entrance chests from filling up and the depot sorted,
  across 200+ blocks.

### v0.7 Character
1. **Ranks:** Novice, Apprentice, Journeyman, Expert, Master from blocks mined and finds; small perks
   (a bit faster, carries more, at Master notices ore one block into a wall).
2. **Personality:** traits generated from the worker's id (same worker, same personality): favourite
   ore, a quirk, its own lines.
3. **Talking:** short lines to nearby players, greets its owner, reacts to finds and lava; rate-limited.
4. **Journal:** a daily log in the menu ("Day 14: dug 412 blocks, 3 diamonds, a lava scare"); "while
   you were away" summary when the owner logs in. Also the LLM's memory later.
5. **A villager's day** (Brian, Nov 14; from the vanilla villager scheduler): villagers work
   0-8000, gather and mingle 8000-10000, work 10000-11000, head home 11000-12000 and are in bed by
   12000 (dusk). Ours dig until 12000, then walk home, so they arrive after dark. Add a "head home"
   hour so they're in bed by dusk, and a midday break: eat from carried food or the home chest and
   mingle with other workers near home. Pausing and resuming uses `crew:paused` like the night does.
6. **Little touches** (Brian, Nov 14): glance at a player passing within a few blocks (head turn,
   a beat's pause, like vanilla `look_at_player`); with nothing to do, stroll near home (vanilla
   `random_stroll` held to its home, like villagers' `move_towards_dwelling_restriction`) instead
   of wherever it stands.

### v0.8 Loose ends
- `collect_skipped`: go back with a better tool for blocks it had to leave.
- `scout`: walk an area without digging and report structures and exposed ores.
- **Move like a villager** (Brian, Nov 14; from comparing with Mojang's vanilla villager files in
  bedrock-samples: `villager_v2.json`, `villager.animation.json`). The Script API can't hand a mob
  a destination, so travel stays scripted (A* + glide); these make it look and feel vanilla.
  Keep decision 14 throughout: never over air or through blocks.
  1. **Feet that match the ground covered:** the villager's walk cycle advances with distance moved
     (`anim_time_update: query.modified_distance_moved`, legs `cos(anim_time * 38.17) * 40`), so
     feet never slide. Ours runs on a timer (`query.life_time * 720`), so feet slide when it slows,
     climbs or eases to a stop. Drive ours by distance; check in game whether
     `modified_distance_moved` tracks teleport-glides, else derive it from position or a pace
     property set by the script. Resource pack only.
  2. **Turn gradually:** today it snaps 90 degrees at each corner (`facingLocation` per step). Blend
     the body's yaw over about 4 ticks (teleport `rotation`), with the head looking ahead first.
  3. **Straight lines** (Brian, Nov 14): workers only move at right angles, block to block along
     the A* path, so a trip to work looks robotic. Head straight for the work when the way is clear:
     smooth the A* path (drop corners where a straight line has a floor and 2 blocks of headroom the
     whole way, checked along the line) and allow diagonal steps.
  4. **Prefer paths, like `minecraft:preferred_path`:** villagers pay per block (dirt path 0, stone
     and planks 1, anything else 3), avoid jumps (cost 20) and big drops, and keep off beds and job
     blocks (50). Give `path.js` block costs the same way, so workers use the roads players build
     and stay off crops, beds and workstations.
- Action-bar progress.

### Later
- **Danger:** mobs can knock a worker out; it wakes in its bed and loses what it carried.
- **Social:** workers greet and chat with each other, bunkhouses.
- **Other roles:** Woodcutter (forests, replanting), Farmer (fields, cooks food for the crew),
  Digger (clearing land, paths).
- **LLM bridge (Phase 2):** a program next to BDS reads `[Crew-Event]` lines and sends
  `crew:exec {json}` orders back. `/crew:ask Dig "find me diamonds and tell me if you find anything
  weird"` becomes a `prospect` call. Gate: 10 plain-English orders in a row map to the right job.
- **Contractor mode (Phase 3):** multi-step plans (prospect, then haul, then report), several
  workers splitting one goal, an approval step before big jobs.

### Open questions (also asked in the shared roadmap)
- How do you build a Hauler? Idea: a barrel with a chest inside (no tools) and a pumpkin on top.
- Does the mine entrance cost wood the worker carries, or is it free?
- Mine names: automatic ("Digby's Diamond Mine No. 1"), chosen when ordering, or both?
- How many workers should be able to roam far from players at once (the world allows 10 loaded areas)?

## LLM connection options (Phase 2)

- **Console bridge (recommended first):** a program starts `bedrock_server`, reads `[Crew-Event]`
  lines from stdout, asks the LLM, and writes `crew:exec {json}` to the server's stdin. Stable APIs,
  any LLM, local or hosted.
- **In-script HTTP:** the pack calls the LLM with `@minecraft/server-net`. Needs the Beta APIs
  experiment on the world, `config/<bp module uuid>/permissions.json` allowing
  `@minecraft/server-net`, and the API key in `secrets.json` there. BDS has no experiments setting, so
  turn the toggle on in a client copy of the world and copy the folder back.

## Open settings (defaults, each a one-line change)

- **Fast pace** (5x tool speed) is open to everyone. Option: operators only, or diamond+ tools only.
- **Operators** can command any worker. Option: owners and crew only.
- **Junk blocks:** `keep = valuables` voids stone, dirt and gravel by default.
- **Look:** villager-style worker with a hard hat, one skin per role (decided Nov 12).
- **LLM for Phase 2:** local model vs hosted API; both work with the console bridge.

## Sources

- Custom commands: https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/custom-commands
- @minecraft/server-net: https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-net/minecraft-server-net
- Scripting on BDS: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting
- @minecraft/server on npm: https://www.npmjs.com/package/@minecraft/server
