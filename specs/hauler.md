# Spec: Hauler (V1, release 1)

Owner: Brian · Status: **ready** · Branch: `feat/hauler` · Builder: B (week 2)

<!-- Drafted Nov 16 2026 by the lead session from docs/PLAN.md "v0.7 Hauler", the CLAUDE.md
roadmap and docs/FACTORY_PLAN.md. Open questions answered by Brian on Nov 18 2026. -->

**Depends on the settlement layer** (`specs/settlement-layer.md`): the Hauler serves one
settlement, its chests and its workers. Build it on top of `feat/settlement-layer` (or after that
merges): both touch `runner.js`, `ui.js`, `orders.js` and `marker.js` (factory rule 9).

## Player story
"I build a Hauler and mark out a depot. Three times a day it walks round my diggers' chests,
carries everything home and sorts it into chests it sets up in the depot, so I'm not running
between chests."

## Decisions (from Brian, dated)
- 2026-11-13 (roadmap, `docs/PLAN.md` v0.7): a **new worker type with its own look** and its own
  menu. It never breaks blocks (it carries, it doesn't dig).
- 2026-11-13 (roadmap): a **`haul` job** for one-off moves from one place to another (params
  `from`, `to` places and an optional `items` filter, per the PLAN job table), usable by slash
  commands and later the LLM.
- 2026-11-13 (roadmap): it **keeps the same daily routine** (home, sleep, energy) as the diggers.
- 2026-11-16 (FACTORY_PLAN): in V1, built by builder B in week 2, shipped in release 1.
- 2026-11-18 **Build (Q1, Q13):** a barrel holding **a bundle and leather boots**, carved pumpkin
  on top. An early-game worker, a step above the tool workers. Keep recipes simple.
- 2026-11-18 **What it collects (Q2, Q3):** automatically from the **drop-off chests of its
  settlement's digging workers**, plus **pickup points** added with the Survey Stake (chest tap:
  "Hauler pickup"). **Never home chests** (left alone for now; later workers or the Hauler may keep
  their own goods there). Only the settlement's chests, never chests outside it, never a worker's
  inventory, kit tools or torches (decision 17).
- 2026-11-18 **Depot (Q4):** a depot **area**, not a named place.
  - Marked with the Survey Stake: tap the ground, "Make a depot here", width and length sliders,
    outline, confirm (like planning a quarry). Needs a flat floor with 2 blocks of headroom.
    One depot per settlement.
  - The Hauler **places chests in the area as it needs them**, in rows with walkways so players and
    the Hauler reach every chest; double chests where there's room.
  - Chests come from settlement storage or are given to it by players; **never crafted**. When it
    has none it says "I need chests for the depot".
  - **Maximum 16 chests**, raised automatically when the area is made bigger (as many as fit with
    walkways).
  - **Organizes as it stores:** one item kind per chest; chests grouped by type (stone and dirt,
    ores and metals, wood, food, other); new items go to the chest holding that kind, else a new
    chest in that type's group. When idle it merges half-stacks and moves strays. Never touches
    shulker boxes, named items or tools.
  - Later (roadmap): the Builder upgrades the depot into a real building.
- 2026-11-18 **Carrying (Q5):** **18 slots** (half a player's 36; "let's try half", tune after the
  playtest). Carries everything from its pickup chests, cobblestone and dirt included. No filter in
  v1 (the diggers' `keep` setting filters at the source).
- 2026-11-18 **Depot full (Q6):** when every chest is full and it can't place another (at the
  maximum or out of chests): keeps what it carries, stops picking up, waits at the depot, says
  "The depot is full" once (chat to the settlement and its status line in the bell's Workers list),
  and carries on by itself when there's room. Never puts things in home chests or outside the depot.
- 2026-11-18 **Rounds, made natural (Q7):**
  - A daily routine: a **morning round** after it wakes and restocks, a **midday round** and an
    **evening round** before dusk, so everything is in the depot by night.
  - The **same route every time**: a fixed loop of its pickup chests, nearest first, back to the
    depot.
  - **A nearly full chest calls it:** when a digger's drop-off chest passes about 3/4 full, it adds
    an extra trip there, so a digger never stops waiting for the next round.
  - Between rounds it stays near the depot and tidies (Q4).
  - It **pauses at each chest while it loads or unloads, longer the more it moves** (about half a
    second per stack: a full chest about 15 s, a nearly empty one a quick stop).
  - Its status line says what it's doing ("On the morning round (3 of 5 chests)", "Tidying the
    depot", "The depot is full").
  - It walks a little slower when its 18 slots are full (pace only).
  - At night it sleeps like every worker; carrying at dusk, it finishes the delivery first.
- 2026-11-18 **Energy (Q8):** walking tires it at about half the rate digging tires a digger, a
  little more when fully loaded. Sleep and food restore it like the others. Worn out, it finishes
  the delivery it's carrying, then rests.
- 2026-11-18 **Delivering (Q9):** not in this spec; on the roadmap (with the Smith).
- 2026-11-18 **Ticking area (Q10):** one moving ticking area while on a round, like a digger,
  released back at the depot. If all 10 are taken it waits at the depot ("Waiting for a free work
  area"), retries each minute, and never takes a digger's area.
- 2026-11-18 **Look (Q11):** the villager-style worker with its own skin: a bundle-shaped leather
  backpack, leather boots, a brown leather cap instead of the hard hat, tan and brown clothes. The
  backpack bulges when it's carrying and is flat when empty.
- 2026-11-18 **Permissions and orders (Q12):** the same as every worker: everyone in the settlement,
  operators any. Its orders: Come here, Stop, Continue, Drop off, Go home, and **"Do a round now"**.
  The bell's settlement-wide orders reach it. Diggers' and Miners' jobs are refused (role split,
  decision 32); diggers and miners refuse `haul` and the round orders.
- Standing rules: never break blocks; stable Script API only; `crew:` ids only; pack UUIDs fixed.

## Out of scope
- Digging of any kind; crafting (including chests); delivering supplies to workers (roadmap).
- Home chests (never read or filled).
- Mine entrance chests: they come with Miner prospecting (release 3); once they exist they're
  picked up like drop-off chests.
- A carry filter in its menu (later if missed).
- More than one Hauler sharing rounds (teamwork is on the roadmap); a second Hauler in the same
  settlement may run its own rounds but nothing coordinates them in v1.
- The depot as a building (Builder, later).

## Done criteria
1. **Mock tests** (`tools/sim/hauler_test.mjs`, in `run.mjs`, exit non-zero on a wrong result):
   - **Build:** a barrel holding a bundle and leather boots with a carved pumpkin on top makes a
     worker with role Hauler (`crew:role` hauler skin); it counts toward the settlement's limit; a
     barrel with tools still makes a digger or miner as before.
   - **Roles:** it refuses dig orders with the usual role message; diggers and miners refuse `haul`
     and "Do a round now"; come, stop, resume, drop off, go home work for it.
   - **Depot:** marking a depot with the stake stores its area on the settlement; the Hauler places
     chests only inside it, in rows leaving walkways, from settlement storage or chests given to it;
     with none it says "I need chests for the depot"; never more than the maximum (16, more for a
     bigger area).
   - **Sorting:** a round with two pickup chests and mixed items: each item ends up in the depot
     chest holding that kind, else a new chest in its type's group; tidying merges half-stacks and
     moves a stray; shulker boxes, named items and tools are never moved by tidying.
   - **Counts:** no item is lost or duplicated over a round or a `haul` (totals before = totals
     after); it carries at most 18 slots per trip.
   - **What it touches:** it takes from settlement drop-off chests and stake pickup points only:
     never a home chest, a chest outside the settlement, a worker's inventory, kit tools or torches.
   - **Schedule:** rounds start at morning, midday and evening (game time); a drop-off chest past
     3/4 full adds a trip; the route order is the same each round; load/unload time grows with the
     stacks moved.
   - **Depot full:** it keeps what it carries, stops, says so once, and resumes when a chest is
     emptied.
   - **Night and energy:** carrying at dusk it delivers first, then goes home and sleeps; walking
     drains energy (more when loaded); worn out mid-trip it delivers, then rests.
   - **Ticking area:** it takes one on a round and releases it at the depot; with none free it waits
     and says so, and never takes a digger's.
   - **`haul`** from place A to B moves every item (or only the filter's) and nothing else.
   - **Reload:** its round survives a reload mid-trip with nothing lost.
2. **Scenario test on staging:** two pickup chests 100+ blocks apart and an empty depot area with 4
   chests in settlement storage, mixed items: all items in the depot, sorted, totals equal, within
   12000 ticks; prints `[Crew-Test] PASS hauler`.
3. **Playtest check for Brian:** one Hauler serving two Diggers' drop-off chests over an in-game
   day: does it keep up, does 18 slots feel right, and does it look and move like a hauler, not a
   miner?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
Best guesses from the current code; the builder confirms before starting.
- **Files:** new `hauler.js` (rounds, route, depot layout, sorting, tidying); `catalog.js` (`haul`,
  `haul_now` and the round job, `roles: ["Hauler"]`); `orders.js`; `workers.js` (building a Hauler
  from a bundle and leather boots, role); `tools.js` (`ROLES` has no Hauler since it isn't
  tool-based: role from the build instead); `runner.js` (round job type, load/unload pauses, loaded
  pace); `life.js` (routine, energy from walking, restock for a role with no tools);
  `settlement.js` (depot area, drop-off chest fill level from `noteChestUse`); `ui.js` (Hauler menu,
  status lines); `marker.js` (stake: "Make a depot here", chest tap "Hauler pickup");
  `guide_pages.js`.
- **Entity and pack:** `crew:role` in `entities/worker.json` gets a hauler value and a `crew:loaded`
  property for the backpack; the RP gets a Hauler skin, the backpack and cap geometry and
  render-controller entries (`node tools/make_textures.mjs`). Model/texture/entity changes need a
  full Minecraft restart to test. The pack UUIDs don't change.
- **Saved data:** on the settlement: the depot area and its chest positions; on the Hauler:
  `crew:pickups` (stake pickup points), round state in the existing job/paused properties. New role
  value in `crew:role`.
- **Player-facing:** CHANGELOG, QA.md checks, a guide page "Haulers", lang strings.

## Open questions
None: all answered by Brian on Nov 18 2026 (see Decisions).
