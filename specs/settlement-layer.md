# Spec: Settlement layer (V1, release 1-2)

Owner: Brian · Status: **building** · Branch: `feat/settlement-layer` · Builder: A (weeks 2-3)

<!-- Drafted Nov 16 2026 by the lead session; every open question answered by Brian Nov 16-17. -->

## Player story
"I ring a bell to found my settlement. Every worker I build joins it. I can see all my workers and
what we've gathered in one place, and give orders to everyone at once."

## Decisions (from Brian, dated)
- 2026-11-16: player story as above (its "allowed more workers as it grows" line went with the
  milestones, Nov 17). **Wording:** the mobs are "workers", the group is the
  "settlement"; players never see "crew" for the group. "Crew-wide orders" are **settlement orders**
  ("orders to everyone"). The `crew:` id prefix and `/crew:` commands stay (rule 4).
- 2026-11-16: drop "crew" from all player-facing text, not just this feature (guide, menus,
  messages, the add-on's display name). That sweep is its own spec, not part of this one.
- 2026-11-16: **the bell is a vanilla bell**, no new item or recipe. **Only a bell the player placed
  themselves** can found a settlement (the add-on records bells as players place them). Crouch-tap
  a placed bell = "Found a settlement here?", then the settlement menu; the crouch-tap is cancelled
  so the bell doesn't ring and villagers don't run indoors. A plain tap rings it as usual. A village's
  own bell answers "This bell belongs to the village".
- 2026-11-16: **one settlement per player.** Crouch-tapping a second placed bell offers "Move your
  settlement here?". **The owner can add friends as members** (like a worker's allowed-players
  list); members' workers join it too. In V1 a player belongs to one settlement only, their own or
  one they were added to.
- 2026-11-16: **the settlement bell can't be broken.** Breaking it by hand is cancelled for everyone,
  owner included ("Move the bell from the settlement menu."), and explosions skip it; the block it
  hangs on or stands on is protected the same way. **"Move the bell"** (settlement menu, owner
  only) puts the bell in the owner's inventory; the settlement, roster and ledger are kept, and the
  menu is unavailable until the bell is placed and crouch-tapped again. If a bell disappears anyway
  (e.g. a `/fill` command), the settlement is kept without a bell in the same way.
- 2026-11-16: **no area in V1.** Membership is by people, not distance: every worker built by the
  owner or a member joins the settlement wherever it's built, and workers live and dig anywhere as
  today.
- 2026-11-16: **members can order every worker:** a member's workers join the settlement,
  and the owner and every member can give orders to any worker in the settlement (this widens
  decision 8; a worker's own allowed-players list still works for players outside the settlement).
- 2026-11-16: **roster** = a "Workers" list in the settlement menu, one button per worker (fits a
  phone): line 1 name and role ("Digby, Digger"); line 2 what it's doing and where ("Quarry 40% ·
  120 blocks NE", "Asleep at home", "Idle"), plus red **"Out of tools"** when it has stopped for
  lack of a tool and yellow **"Tools low"** when a kit tool is at 10% or less. Line 2 also says
  whether a far-away worker is **"Working far away"** (it holds a ticking area) or **"Paused:
  nobody nearby"** (no ticking area left); a far-away idle or sleeping worker shows its last known
  state with "last seen N min ago". Tapping a worker opens its usual worker menu (orders if you may
  give them, status only otherwise); an order to an unloaded worker waits until its area loads.
  Energy, carrying and tools stay in the worker's own menu.
- 2026-11-16: **ledger = live contents of the settlement's storage chests.** Storage chests are the
  chests the settlement already knows (home chests, drop-off chests, named places, later the Hauler
  depot) plus any chest a member adds by tapping it with the Survey Stake ("Add to settlement
  storage"). Double chests and barrels count; a shulker box counts as one item (not opened). A
  storage chest whose area is loaded is re-read every few seconds and right after a worker puts in
  or takes out; one that isn't loaded shows its last known contents marked "as of N min ago". The
  menu shows totals per item across all storage, most first; tapping an item lists which chests
  hold it. The depot is meant to become the central store of raw materials that later crafters
  (the Smith) take from; the Smith keeps what it makes in its own storage chest, which also counts.
- 2026-11-16: **no "brought in" tally in V1** (live contents only; a tally may come back with the
  v0.8 journal).
- 2026-11-17: **existing workers join automatically.** Founding a settlement adds all the owner's
  workers, wherever they are; adding a member adds all that member's workers. Jobs, homes, tools,
  names and allowed players are unchanged (joining only adds the settlement link). A worker in an
  unloaded area joins the next time it loads (one-time migration, with a mock test loading an old
  save). The player gets one message, e.g. "7 of your workers joined <settlement>".
- 2026-11-17: **settlement orders (V1):** Stop (unfinished digs kept as paused), Continue, Drop off
  (each at its usual drop-off chest), Go home (no home = stays put) and Come to the bell, in a "Give
  orders to everyone" section of the settlement menu; given by the owner and members. Each has a
  "Who?" choice: everyone, or one role ("All Diggers"). Each is sent as the normal typed
  `{by, worker, job, params}` order to every chosen worker; an unloaded worker runs it when it
  loads. Dig orders stay one worker at a time.
- 2026-11-17: **worker cap is per player** (each member of a shared settlement has their own
  allowance) and **applies with or without a bell** (no settlement = the same cap). Workers over the cap when this ships are kept and keep working; only new
  builds are refused, leaving the barrel and tools as they were ("You have 6 workers, your limit is
  4."). **The base cap should allow one worker of each type**: 6 in V1 (Digger, Miner, Hauler,
  Woodcutter, Farmer, Sifter), 8 once the Smith and Builder arrive. 6 per player x 4 players = 24,
  the top of the week 3 load test, which confirms or lowers it.
- 2026-11-17: **no milestones.** Players play how they want; the cap is only a server safety limit,
  not something to earn. The settlement layer has four parts: bell claim, roster, ledger,
  settlement orders, plus the cap. **The cap is one per-player number an operator can change in
  game** (operator-only setting in the settlement menu, and a slash command), **starting at 6**
  (also the Dec 6 default); the week 3 load test sets the real value. The challenge comes instead
  from each worker type's build cost ("stronger workers cost more to build"), decided in each
  worker's own spec, not here.
- 2026-11-17: **settlements have names**, typed when founding (the box starts as "<player>'s
  Settlement"), shown as the settlement menu's title and in messages; the owner can rename it from
  the menu. No automatic sign.
- 2026-11-17: **release split.** Release 1 (Dec 6, with the Hauler): founding at a placed bell,
  bell protection and Move the bell, members, names, existing workers joining, the roster (with
  tools warnings and far-away status), the per-player cap and its operator setting. Release 2
  (Dec 13): the ledger (storage chests, adding chests with the stake, live totals) and settlement
  orders. Brian, Nov 17: start building now, ahead of the Nov 30 slot, to reach V1 sooner.
- 2026-11-16 (FACTORY_PLAN): the settlement layer has five parts: **bell claim, roster, ledger,
  settlement orders, worker cap with milestone raises.** (Milestones dropped Nov 17, below.)
- 2026-11-16 (FACTORY_PLAN): it's in V1. Builder A starts it in week 2 (Nov 30); the core ships in
  release 1 (Dec 6) with the Hauler, the rest in release 2 (Dec 13).
- 2026-11-16 (FACTORY_PLAN): the default worker cap is set by Brian from the week 3 load test
  (16 to 24 workers). Balance numbers (the cap) are Brian's call, not the builder's.
- Standing rules that apply: stable Script API only (decision 1); no new pack UUIDs, `crew:` ids
  only (CLAUDE.md rule 4); existing workers on the live world must keep working (migration + test).

## Out of scope
- Hauler rounds and the depot (`specs/hauler.md`), even though the ledger may count what haulers move.
- Woodcutter, Farmer, Sifter, prospecting (their own specs).
- LLM orders. Settlement orders must use the same typed `{by, worker, job, params}` orders, so the
  LLM bridge can use them later, but no LLM work here.
- Settlements interacting (trade, rivalry, war).
- Later (roadmap, Brian Nov 17): teamwork, several workers of one role splitting one dig.
- Later (roadmap, Brian Nov 16): take over an existing village by crouch-tapping its bell and
  paying an offering; a claimed village unlocks Builder homes in that village's style.

## Done criteria
Split by release; release 1 can merge to `main` on its own before release 2 is built.

1. **Mock tests** (`tools/sim/settlement_test.mjs`, in `run.mjs`, exit non-zero on a wrong result).

   *Release 1*
   - crouch-tapping a bell the player placed founds a settlement with the typed name (default
     "<player>'s Settlement") and the interaction is cancelled (no ring); a bell nobody placed answers
     "This bell belongs to the village" and founds nothing; a plain tap is not cancelled;
   - one settlement per player: crouch-tapping a second placed bell offers to move it, and moving
     keeps roster, members and name;
   - breaking the settlement bell or the block it hangs on or stands on is cancelled for every
     player, owner included; an explosion leaves both; "Move the bell" (owner only) puts a bell in the
     owner's inventory and keeps the settlement with no bell until it's placed and crouch-tapped;
     a bell removed some other way leaves the settlement kept without a bell;
   - the owner adds and removes members; a player belongs to one settlement only; the owner can rename;
   - every worker built by the owner or a member joins, wherever it's built; the roster survives a
     reload; the owner and every member can give orders to any settlement worker; a player outside
     the settlement still needs the worker's allowed-players list;
   - founding (or adding a member) brings in that player's existing workers, including one loaded
     only later, from a save made before this update, with jobs, homes, tools, names and allowed
     players unchanged; one "N of your workers joined <name>" message;
   - roster lines: name and role; job and progress or asleep/idle; "Out of tools" when stopped for
     lack of a tool; "Tools low" at 10% or less; "Working far away" / "Paused: nobody nearby";
     "last seen N min ago" for an unloaded idle or sleeping worker;
   - cap: building a worker at the cap is refused with "You have N workers, your limit is M." and the
     barrel and tools are left as they were; the cap counts per player, with or without a settlement;
     workers already over the cap keep working; an operator can change the cap (takes effect at once),
     a non-operator can't; the default is 6.

   *Release 2*
   - storage chests: the settlement's known chests plus chests added with the Survey Stake; ledger
     totals equal the summed contents of the loaded storage chests after workers and players add
     and remove items (double chests and barrels counted, a shulker box as one item); an unloaded
     chest keeps its last known contents with its timestamp; tapping an item lists its chests;
   - settlement orders: Stop, Continue, Drop off, Go home and Come to the bell reach every chosen
     worker (everyone, or one role) as a normal typed order; an unloaded worker runs it when loaded;
     only the owner and members can give them.
2. **Scenario test on staging:** flat world, a bell claim, a cap of 3 set by an operator, 3 workers
   built, one small quarry -> roster shows 3, a 4th worker is refused, and (release 2) ledger totals
   match the drop-off chest, within 6000 ticks; prints `[Crew-Test] PASS settlement`.
3. **Playtest check for Brian:** found a settlement on the copy of the live world: do your existing
   workers show up, and do the roster and ledger read well on a phone-size menu?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
Best guesses from the current code; the builder confirms before starting.
- **Files:** new `settlement.js` (claim, roster, ledger, cap); `workers.js` (join on build, cap
  check in `spawnWorker`); `orders.js` / `catalog.js` (settlement order target); `ui.js` / `forms.js`
  (bell menu, roster, ledger); `commands.js` (maybe `/crew:settlement`); `store.js` (world data);
  `runner.js` (re-read a storage chest after a worker drop-off; out-of-tools status for the roster;
  coordinate with the Hauler builder: never both in `runner.js` the same week); `marker.js`
  ("Add to settlement storage" chest tap); `main.js` (bell interaction); `guide_pages.js`.
- **Saved data:** a world dynamic property such as `crew:settlements` (owner, bell position and
  dimension, name, roster ids, storage chests and their last known contents) and the cap; on each worker `crew:settlement`.
  World dynamic properties have a size limit, so chest contents are stored as item counts, one
  property per chest if needed.
- **Player-facing:** CHANGELOG, QA.md checks, a guide page, lang strings for any new item.

## Open questions
None (all answered Nov 16-17).
