# Spec: Settlement layer (V1, release 1-2)

Owner: Brian · Status: **draft** · Branch: `feat/settlement-layer` · Builder: A (weeks 2-3)

<!-- Drafted Nov 16 2026 by the lead session from docs/FACTORY_PLAN.md. The brainstorm that produced
the five parts below wasn't available to this session, so only what the plan states is under
Decisions; everything else (including what each part means in detail) is an Open question. -->

## Player story
"I ring a bell to found my settlement. Every worker I build joins it, I can see the whole crew and
what we've gathered in one place, and I can tell the whole crew to do something at once. As the
settlement grows, I'm allowed more workers."

(Draft wording: Brian to confirm or rewrite, see Q1.)

## Decisions (from Brian, dated)
- 2026-11-16 (FACTORY_PLAN): the settlement layer has five parts: **bell claim, roster, ledger,
  crew-wide orders, worker cap with milestone raises.**
- 2026-11-16 (FACTORY_PLAN): it's in V1. Builder A starts it in week 2 (Nov 30); the core ships in
  release 1 (Dec 6) with the Hauler, the rest in release 2 (Dec 13).
- 2026-11-16 (FACTORY_PLAN): the default worker cap is set by Brian from the week 3 load test
  (16 to 24 workers). Balance numbers (the cap, the milestones) are Brian's call, not the builder's.
- Standing rules that apply: stable Script API only (decision 1); no new pack UUIDs, `crew:` ids
  only (CLAUDE.md rule 4); existing workers on the live world must keep working (migration + test).

## Out of scope
- Hauler rounds and the depot (`specs/hauler.md`), even though the ledger may count what haulers move.
- Woodcutter, Farmer, Sifter, prospecting (their own specs).
- LLM orders. Crew-wide orders must use the same typed `{by, worker, job, params}` orders, so the
  LLM bridge can use them later, but no LLM work here.
- Settlements interacting (trade, rivalry, war).

## Done criteria
Drafts: the numbers and exact behaviour depend on the open questions.
1. **Mock tests** (`tools/sim/settlement_test.mjs`, in `run.mjs`, exit non-zero on a wrong result):
   - ringing/placing the bell creates one settlement owned by the player; a second claim by the same
     player is refused (or moves it, per Q3);
   - a worker built inside the settlement joins its roster; the roster survives a reload;
   - workers built before this update join their owner's settlement (or stay unaffiliated, per Q7)
     with jobs, homes and tools unchanged;
   - the ledger counts what roster workers drop off, per item, and the totals match the chests;
   - a crew-wide order reaches every roster worker whose role takes the job, and each other worker
     answers with the usual role refusal;
   - building one worker more than the cap is refused with a message, the barrel and tools are left
     as they were; reaching a milestone raises the cap by the agreed amount.
2. **Scenario test on staging:** flat world, a bell claim, 3 workers built, one small quarry ->
   roster shows 3, ledger totals match the drop-off chest, a 4th worker over a cap of 3 is refused,
   within 6000 ticks; prints `[Crew-Test] PASS settlement`.
3. **Playtest check for Brian:** found a settlement on the copy of the live world: do your existing
   workers show up, and does the roster/ledger read well on a phone-size menu?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
Best guesses from the current code; the builder confirms before starting.
- **Files:** new `settlement.js` (claim, roster, ledger, cap); `workers.js` (join on build, cap
  check in `spawnWorker`); `orders.js` / `catalog.js` (crew-wide order target); `ui.js` / `forms.js`
  (bell menu, roster, ledger); `commands.js` (maybe `/crew:settlement`); `store.js` (world data);
  `runner.js` only if drop-offs must report to the ledger there (coordinate with the Hauler builder:
  never both in `runner.js` the same week); `main.js` (bell interaction); `guide_pages.js`.
- **Saved data:** a world dynamic property such as `crew:settlements` (owner, bell position and
  dimension, name, roster ids, ledger, cap, milestones reached); on each worker `crew:settlement`.
  World dynamic properties have a size limit, so the ledger must stay small (counts, not logs).
- **Player-facing:** CHANGELOG, QA.md checks, a guide page, lang strings for any new item.

## Open questions
Every guess in this draft. Each needs Brian's answer before status `ready`.
1. **Player story:** is the wording above right? What's the one-line pitch?
2. **The bell:** a vanilla bell the player places and taps (crouch-tap?), or a new `crew:` item or
   block? Does it need a recipe?
3. **Claim:** one settlement per player, or several? Can friends share one (co-owners, like the
   worker permission list)? What happens if the bell is broken: settlement gone, paused, or kept?
4. **Area:** does a settlement have an area (radius around the bell)? If so, how big, and does it
   limit where workers live or dig, or only who joins?
5. **Roster:** what does it show per worker (name, role, job, energy, where it is, carrying)? Can you
   give orders from it?
6. **Ledger:** counts of what's been dug and dropped off, or the live contents of settlement chests,
   or both? Per day, all-time, or both? Which chests count (home chests, drop-offs, named places,
   the Hauler's depot)?
7. **Existing workers:** do workers already on the live world join their owner's settlement
   automatically when the bell is placed, or does the owner add them?
8. **Crew-wide orders:** which ones? (All come home, all stop, all go to bed, all drop off, all
   continue?) Who may give them: the owner, the allowed players, operators?
9. **Worker cap:** per player or per settlement? Is there a cap before any bell is placed (no bell =
   cap of N)? What happens to workers over the cap when it's introduced (kept, frozen)?
10. **Milestones:** what raises the cap: blocks dug, items in the ledger, days survived, number of
    beds, something built? By how much each time, and up to what maximum?
11. **Default cap:** to be set after the week 3 load test, but release 1 (Dec 6) ships before it:
    what cap goes out on Dec 6 (a safe low number such as 4 per player)?
12. **Name:** do settlements have names (typed at the bell, shown on a sign)?
13. **Release split:** which parts are the "core" for Dec 6 (suggestion: bell claim, roster, cap)
    and which wait for Dec 13 (ledger, crew-wide orders, milestones)?
