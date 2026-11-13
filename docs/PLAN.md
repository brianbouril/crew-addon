# Crew add-on: build plan and job spec

Copy of the plan doc (https://claude.ai/artifact/TG1aYq6MtaeR8j6YroBcML) as of v0.2, Nov 13 2026,
so this folder carries the full context on its own. If the two differ, this file and the code win.

## Summary

Crew is a Minecraft Bedrock add-on where small worker mobs run deterministic jobs. Every job is a
typed command that a person, a script or later an LLM can call the same way.

- **Design rule:** the job catalog is the LLM's tool set. The LLM picks a job and fills its
  parameters; it never pathfinds, breaks blocks or decides what counts as "valuable". The add-on
  does all of that, the same way every time.
- **Current build (v0.2):** workers are built from a barrel holding tools with a carved pumpkin on
  top, and the tools set what they can mine and how fast. Two mining jobs (`quarry` with a walk-up
  stair, `branch_mine` with 2 solid blocks between branches), a crouch menu for orders, names,
  roles and permissions, tap-to-give for tools, and a Survey Stake that draws the plan in particles.
  Named places, owner plus crew permissions and the `/crew:` slash commands carry over from v0.1.
  The job logic runs end to end in a mock world but has not yet run in real Minecraft.
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
| `branch_mine` | `start`, `facing`, `target_y` (default -54), `trunk_length` (32), `branch_length` (32), `spacing` (2, 1 to 16), `deposit`, `keep`, `pace` | Stairs down to `target_y`, a 2-wide trunk, 1-wide branches on both sides with `spacing` solid blocks between them, far end first | v0.2 |
| `come` | `to` (a player) | Walks to the player and waits | v0.1 |
| `stop` | none | Finishes the current block, saves progress, goes idle | v0.1 |
| `status` | none | Job, progress %, phase, blocks it left, items carried, tools and uses left | v0.2 |
| `collect_skipped` | `job` (default: last) | Goes back for blocks a job left because no tool could harvest them, once it has a better tool | Planned |
| `haul` | `from`, `to` (places), `items` (optional filter) | Moves chest contents between named places, e.g. to "blue base" | Planned |
| `scout` | `area`, `report` = structures / ores | Walks a box and reports finds without digging | Planned |

### Branch mine layout

"Two solid blocks between branches" means a branch, two blocks of rock, then the next branch, so
branches sit every 3rd block along the trunk. Every block in those walls touches a tunnel.

- **Stairs:** 1 wide, 3 blocks of headroom, one step down per block forward, to `target_y`.
- **Trunk:** 2 wide, 2 tall, `trunk_length` long, straight ahead.
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
`job_done`, `job_failed`. Each goes to the owner and whoever gave the order, and is printed to the
server console as `[Crew-Event] {json}`, which is what the LLM bridge will read.

### Building a worker

Put one to five tools in a barrel, then place a carved pumpkin on top. The two blocks become a
worker owned by whoever placed the pumpkin. Tools become the kit, other barrel items go to hauling
slots. A barrel with no tool stays a barrel and chat says to add one. Hold a tool and tap the worker
to give it another; crouch and tap for the menu. `/crew:hire` (operators) spawns one for testing.

## Phases

1. **v0.1 Miner (done):** one worker, box dig, places, permissions, Survey Stake corners.
2. **v0.2 Mining patterns and tools (done in code, mock-tested):** see above. Gate: on BDS a
   16x16x10 quarry and a default branch mine both finish into a chest, nothing outside the plan is
   touched, and a friend can use the menu once allowed.
3. **v0.3 Hardening:** walking animation and tool in hand, action-bar progress, `collect_skipped`,
   better falling-gravel handling. Gate: a 64-cube dig survives a server restart mid-job.
4. **Phase 1b Logistics:** `haul` between named places, `scout`/structure reports.
   Gate: "haul from mine chest to blue base" works across 200+ blocks.
5. **Phase 2 LLM bridge:** a small program next to BDS reads `[Crew-Event]` lines and sends
   `crew:exec {json}` orders back. The LLM sees the job schema as tools plus places and worker status;
   `/crew:ask Dig "branch mine here at diamond level and tell me if you find anything weird"` becomes
   a `branch_mine` call. Gate: 10 plain-English orders in a row map to the right job, no bad calls.
6. **Phase 3 Contractor mode:** multi-step plans (dig, then haul, then report), several workers
   splitting one job, an approval step before big jobs.

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
- **Look:** small hard-hat worker (fits 1-high tunnels).
- **LLM for Phase 2:** local model vs hosted API; both work with the console bridge.

## Sources

- Custom commands: https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/custom-commands
- @minecraft/server-net: https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-net/minecraft-server-net
- Scripting on BDS: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting
- @minecraft/server on npm: https://www.npmjs.com/package/@minecraft/server
