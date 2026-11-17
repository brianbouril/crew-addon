# Spec: Hauler (V1, release 1)

Owner: Brian · Status: **draft** · Branch: `feat/hauler` · Builder: B (week 2)

<!-- Drafted Nov 16 2026 by the lead session from docs/PLAN.md "v0.7 Hauler", the CLAUDE.md
roadmap and docs/FACTORY_PLAN.md. Only what those state is under Decisions; every guess is an Open
question. -->

## Player story
"I build a Hauler and give it a depot, like 'blue base'. It walks round my workers' chests, carries
everything home and sorts it into the depot chests, so I'm not running between chests."

## Decisions (from Brian, dated)
- 2026-11-13 (roadmap, `docs/PLAN.md` v0.7): a **new worker type with its own look** (a backpack,
  no tool) and its own menu.
- 2026-11-13 (roadmap): **Depot** = a named place (like "blue base"); the chests near it count as
  one depot.
- 2026-11-13 (roadmap): **Rounds**: it collects from its owner's mine entrance chests and any
  pickup points it's given, carries to the depot, and puts each item in a depot chest that already
  holds that item, else any free one.
- 2026-11-13 (roadmap): a **`haul` job** for one-off moves from one place to another (params `from`,
  `to` places and an optional `items` filter, per the PLAN job table), usable by slash commands and
  later the LLM.
- 2026-11-13 (roadmap): it **keeps the same daily routine** (home, sleep, energy) as the diggers.
- 2026-11-16 (FACTORY_PLAN): it's in V1, built by builder B in week 2 and shipped in release 1
  (Dec 6) with the settlement core.
- Standing rules: never break blocks (it carries, it doesn't dig); never take a worker's kit tools or
  torches (decision 17); stable Script API only; `crew:` ids only.

## Out of scope
- Digging of any kind; crafting; restocking other workers' tools (could be later, see Q9).
- Mine entrance chests themselves: they come with Miner prospecting (release 3, Dec 20).
- Ledger totals (settlement layer), beyond reporting what it moved.
- Smarter sorting (by category, item frames, signs), unless Brian moves it in.

## Done criteria
Drafts: numbers and details depend on the open questions.
1. **Mock tests** (`tools/sim/hauler_test.mjs`, in `run.mjs`, exit non-zero on a wrong result):
   - building a Hauler (the build per Q1) makes a worker with role Hauler and the backpack skin;
     it refuses dig orders with the usual role message; diggers refuse `haul`;
   - `haul` from place A to place B moves every item (or only the filter's items) and nothing else;
     no item is lost or duplicated (counts before = counts after);
   - a round with two pickup chests and a depot of three chests: each item lands in a chest already
     holding it, else a free one; when the depot is full it stops and says so, keeping what it carries;
   - it never takes from a worker's inventory, never touches kit tools or torches;
   - at dusk it finishes the trip or drops at the depot, goes home and sleeps; at dawn it resumes rounds;
   - its job survives a reload mid-trip, with nothing lost.
2. **Scenario test on staging:** two pickup chests 100+ blocks apart and a 3-chest depot, mixed
   items -> all items in the depot, sorted, totals equal, within 12000 ticks; prints
   `[Crew-Test] PASS hauler`.
3. **Playtest check for Brian:** one Hauler serving two Diggers' quarry chests over an in-game day:
   does it keep up, and does it look and move like a hauler, not a miner?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
Best guesses from the current code; the builder confirms before starting.
- **Files:** new `hauler.js` (rounds, sorting, depot); `catalog.js` (`haul` job, `roles: ["Hauler"]`,
  rounds job); `orders.js`; `workers.js` (building a Hauler, role); `tools.js` (`ROLES` has no
  Hauler since it isn't tool-based: role from the build instead); `runner.js` (a new job type in
  the loop; coordinate with the settlement builder); `life.js` (routine and restock for a role with
  no tools); `ui.js` / `marker.js` (depot and pickup points: the stake's chest tap already sets named
  places); `store.js` (places); `guide_pages.js`.
- **Entity and pack:** `crew:role` property in `entities/worker.json` gets a new value, and the RP
  needs a Hauler skin (backpack) and render controller entry. Model/texture/entity changes need a
  full Minecraft restart to test. The pack UUIDs don't change.
- **Saved data:** on the Hauler `crew:depot` (place name), `crew:pickups` (list of places or chest
  positions), round state in the existing job/paused properties. New role value in `crew:role`.
- **Player-facing:** CHANGELOG, QA.md checks, a guide page "Haulers", lang strings.

## Open questions
Every guess in this draft. Each needs Brian's answer before status `ready`.
1. **How do you build a Hauler?** The roadmap's idea: a barrel with a chest inside (no tools) and a
   carved pumpkin on top. Yes, or something else?
2. **Pickup points before prospecting:** Hauler ships Dec 6 but mine entrance chests come Dec 20.
   Until then, what does it collect from: its owner's workers' drop-off chests and quarry chests
   automatically, only places you name, or both?
3. **Whose chests:** only its owner's workers' chests, or any chest of anyone in its settlement
   (with the settlement layer)? Never other players' chests unless shared?
4. **Depot area:** how far from the named place does a chest count as part of the depot (8 blocks,
   like the home chest)? Do double chests, barrels and shulker boxes count?
5. **What it carries:** how many slots (36 like the others, or fewer to make trips matter)? Does it
   carry everything, or leave some items behind (e.g. cobblestone, dirt), and who decides (a filter
   in its menu)?
6. **Depot full:** stop and ask, or put the rest in its home chest, or carry on leaving pickups full?
7. **Round schedule:** keep going all day, a round every N minutes, or only when a pickup chest is
   getting full?
8. **Energy:** does carrying tire it like digging does? Does food matter?
9. **Delivering:** should it also bring torches/tools from the depot to diggers who ask (a later
   spec)?
10. **Distance:** rounds 200+ blocks away need the worker's area loaded (ticking areas, 10 per world).
    OK for the Hauler to use one ticking area while travelling, like a digging worker does?
11. **Look:** backpack over the villager-style worker, no hard hat? Any colour or detail you want?
12. **`haul` permissions:** same as other orders (owner and allowed players, operators)?
13. **Build cost:** stronger workers cost more to build (roadmap, Nov 17). Where does the Hauler
    sit: an easy early worker, or one that takes some progress (e.g. a chest plus iron ingots, a
    minecart, leather for the backpack)?
