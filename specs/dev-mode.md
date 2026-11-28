# Spec: dev mode (v0.4)

Owner: Brian · Status: ready · Branch: `feat/dev-mode`

<!-- Brian's 2026-11-27 direction closed the open questions and left the design to the builder.
The choices under "Chosen design" are that design, not guesses. -->

## Player story

An operator turns on a clearly labelled dev mode and immediately gets every crew item, plus any worker
type with the tools and a stocked home chest, so a large QA session can cover every feature. It is
off unless that operator turns it on, and a normal game is unchanged while it is off.

## Decisions (from Brian, dated)

- 2026-11-27: "Add a dev mode in game that lets me generate all the workers and items I'd need
  immediately," so Brian can run a large QA session across every feature.
- 2026-11-27: Dev mode is off by default. Only an operator can switch it on. It is clearly labelled
  in game. It never affects normal play when off, and it saves no personal information.
- 2026-11-27: The dev menu gives every crew item (Survey Stake, sieve, and any job or tool items).
  It spawns any worker type ready to work: Digger, Miner, Hauler, Woodcutter, Farmer and Sifter,
  along with their tools, plus home chests stocked with typical inputs such as pickaxes, seeds,
  wood, gravel and torches. It can bypass or raise the V1 worker cap only while dev mode is on.
  Skipping to morning or night, for testing schedules, is optional.

## Chosen design (builder, under that direction)

- `/crew:dev` is operators only (`CommandPermissionLevel.GameDirectors`, same bar as `/crew:cap`).
  `on` and `off` switch it. With no argument, or `menu`, a player gets the menu. `morning` and
  `night` skip the clock. The menu title is "Dev mode" and the chat lines say "Dev mode".
- The switch is the world dynamic property `crew:devMode` (boolean `true`, or absent when off).
  It stores no player id, name, or gamertag. Turning it off deletes the property.
- While it is on, `capCheck` allows another worker. The stored `crew:cap` number is not changed,
  so turning dev mode off applies the same limit again. Workers already spawned stay.
- The menu gives one Survey Stake (the existing one-per-player rule), four sieves, and the vanilla
  tools and supplies those jobs use. An item this pack build does not have yet is skipped and named
  in the message, so the same menu works before and after the sieve item lands.
- Spawn uses the normal `spawnWorker` path. Digger, Miner, Woodcutter and Farmer get their tool.
  A Hauler gets a bundle and leather boots in the gear slots. A Sifter carries a sieve, and a sieve
  block is placed when this pack has that block. Each gets a bed, a home chest, and full energy.
  The role name is stored on `crew:role`. The name tag shows that role when `ROLE_LIST` includes it
  (Hauler and Sifter join that list with their own updates). Dev mode does not hardcode a skin index.
- Morning is time of day 1000 and night is 13000 (`TimeOfDay.Day` and `TimeOfDay.Night` on
  `@minecraft/server` 2.2.0, via `world.setTimeOfDay`). Night falls inside this add-on's night
  (12000 until 23000). The skip works only while dev mode is on. Turning dev mode off does not
  rewind the clock.
- This branch is based on `main` at `9bc792d` because the Hauler, ledger, Woodcutter and Farmer,
  stake icon, Sifter, and Miner branches were still open and uncombined. The new code is a new
  module plus a cap check and a startup import, so it can rebase after those merges.

## Out of scope

- Turning the clock back when dev mode is switched off, and dismissing the workers it spawned.
- Changing the number `/crew:cap` stores. Operators still change that number with `/crew:cap`.
- A dev mode for players who are not operators.
- New jobs, new pack UUIDs, or a beta Script API module.
- A GameTest pack. Layer 2 is not built. GameTest stays out of `crew_bp/` and `crew_rp/`.
- Editing the six feature branches, or teaching dev mode a hardcoded `crew:role` index.

## Done criteria

Every one of these must pass before the branch merges. The `reviewer` subagent checks each.

1. **Mock test:** `tools/sim/devmode_test.mjs`, registered in `tools/sim/run.mjs`, exits non-zero
   on a wrong result. It checks: dev mode is off by default and spawn, items, and the clock skip
   refuse while it is off; a non-operator cannot turn it on; `/crew:dev` is registered for operators
   and the menu is titled "Dev mode" with a button for each of the six roles plus items, morning,
   and night; the item grant includes the Survey Stake (still only one), sieves, tools, a bundle,
   leather boots, torches, planks, seeds, wood, gravel, and a water bucket; each spawned worker has
   its tool or gear, full energy, and a home chest with that job's supplies (pickaxes, seeds, wood,
   gravel, torches); the stored cap number does not change while extra workers and a barrel build
   are allowed, and both are refused again after `/crew:dev off`; night then morning move
   `world.getTimeOfDay()` to 13000 then 1000, and turning dev mode off leaves the clock there; the
   only dev-mode world property is `crew:devMode`, and it is gone when dev mode is off.
2. **Scenario test on staging:** not built. Layer 2 does not exist yet. Do not add a GameTest pack.
3. **Playtest check for Brian:** as an operator, `/crew:dev on`, then spawn one of each worker and
   give every test item. Each worker stands beside you with a home chest. `/crew:dev off` and a
   barrel build past the limit is refused again.
4. **No new script errors** in the server log over a 30 minute run on staging.

## Touches

- **Files:** `crew_bp/scripts/devmode.js` (new), `crew_bp/scripts/main.js` (one import),
  `crew_bp/scripts/settlement.js` (`capCheck` only), `tools/sim/mock/@minecraft/server/index.js`
  (`world.setTimeOfDay`), `tools/sim/mock/@minecraft/server-ui/index.js` (form log for the test),
  `tools/sim/devmode_test.mjs`, `tools/sim/run.mjs`, `crew_bp/scripts/guide_pages.js`,
  `PLAYER_GUIDE.md`, `CHANGELOG.md`, `docs/QA.md`. Not `runner.js`.
- **Saved data:** world dynamic property `crew:devMode`, boolean `true` while on, deleted when off.
  No migration: old saves do not have the key, which means off. No player id or name is written.
- **Player-facing text:** CHANGELOG Unreleased, QA checks D1–D7, guide page "Dev mode" and the
  `/crew:dev` line on the Commands page.

## Open questions

None. Brian's 2026-11-27 direction answered them, and the design choices above are the builder's
under that direction.
