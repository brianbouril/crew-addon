# Spec: Sifter (V1)

Owner: Brian · Status: **building** · Branch: `feat/sifter` · Builder: A

<!-- Questions answered by Brian on 2026-11-27, so this spec was ready to build. The builder has started, and the pull request stays open while the status is building (Brian, 2026-11-27, spec status words). Design choices in this file are the Bedrock expression of those answers. They are balance numbers or station layout, recorded so Brian can retune them after playtest. They are not guesses filling an open question. -->

## Player story
"I craft a sieve from iron bars and a stick. I set a chest of gravel on top and a chest underneath. I can sift a piece by hand, or power the sieve with redstone and it keeps sifting whenever more gravel, sand, dirt, or soul sand shows up. A Sifter I build can mind one sieve during the day. Ore in that top chest stays put for the Miner or the Hauler."

## Decisions (from Brian, dated)
- 2026-11-16 (FACTORY_PLAN): the Sifter is a V1 feature. Builder A builds it. Sifter odds are a balance number only Brian sets.
- 2026-11-17 (specs/settlement-layer.md): the base cap allows one of each V1 type. V1 is 6: Digger, Miner, Hauler, Woodcutter, Farmer, Sifter. Prospecting is the Miner's job, not a seventh type. This spec does not change the cap number (`CAP_DEFAULT` stays 6).
- 2026-11-17 (docs/PLAN.md): the Sifter is mid to late game and should cost more to build than a tool worker. This spec sets the recipe.
- 2026-11-27 (Brian, this task): **Build.** A new custom sieve item, crafted from sticks and iron bars. The texture needs a black outline, like the Survey Stake.
- 2026-11-27: **Input.** Gravel, sand, dirt, and soul sand, plus a bonus loot table. Start the odds modest. Soul sand follows the Nether rule: the player has to provide it. The sieve never goes to the Nether and never gathers soul sand from the world.
- 2026-11-27: **Material source.** The player supplies it, or it comes from the Miner's prospecting output. The Miner is built in parallel on `feat/miner-prospecting`. This branch does not touch Miner files. The handoff is a vanilla chest (below).
- 2026-11-27: **Operation.** The player can run the sieve by hand, or power it with redstone so it runs whenever input arrives and redstone is on. Ongoing, not a single batch.
- 2026-11-27: **Cap.** Both the Sifter and prospecting count toward the V1 cap of 6. Building a Sifter worker spends one slot of that cap. Placing extra sieve blocks does not. Prospecting does not add a role.
- 2026-11-28 (merge order): Hauler keeps entity property 4, because its cap, backpack, and chest handoff are already tied to that index. Sifter appends at 5. Miner, Digger, Woodcutter, and Farmer stay 0–3.
- Standing rules that still apply: stable Script API only; never change pack UUIDs or the `crew:` namespace; a Sifter refuses dig orders; come, stop, resume, status, drop off, and home stay open to every role; the same daily routine (sleep at night, resume in the morning) for the worker. Redstone does not sleep.

## Design choices (builder, 2026-11-27)

These follow the answers above. Brian can retune the balance numbers after playtest without a save migration.

### The station is a block
The draft's walking dig does not fit "by hand, or redstone, ongoing." The station is a placeable block `crew:sieve`. The item you craft is that block. One recipe, one id.

**Recipe (balance):** shaped, one sieve.

```text
B B B
B S B
B B B
```

`B` is `minecraft:iron_bars`, `S` is `minecraft:stick`. That is 8 iron bars and 1 stick. Eight bars are exactly 3 iron ingots (6 ingots make 16 bars). That is mid-game iron, the low end of mid-to-late, and it uses only the two materials Brian named. The frame is the bars; the stick is the handle.

**Texture:** 32×32, pixel art, a `#000000` outline around the sieve and the handle. Wood and iron colors come from the Survey Stake and a grey mesh. This matches Brian's outline request and the 32×32 Survey Stake target. The placed block uses the same picture. The Sifter's skin is a separate 64×64 villager texture (index 5), with its own hat color and no black outline. Hauler keeps index 4.

### Input chest and output chest (the Miner handoff)
Chests and barrels are vanilla. The sieve is not a container, so hoppers do not insert into the block. They can still fill and empty the chests.

| Place | What it is |
| --- | --- |
| On top of the sieve | **Input.** The chest or barrel the sieve reads. The player, a hopper, the Hauler, or the Miner's prospecting output can put items here. This branch does not edit Hauler or Miner code. Any normal chest the other branch already fills is the input if the player places the sieve directly under it. |
| Under the sieve | **Output.** Yields land here. |

The sieve consumes only `minecraft:gravel`, `minecraft:sand`, `minecraft:dirt`, and `minecraft:soul_sand`. Everything else in the input chest stays, including ores, flint, and tools. `minecraft:red_sand`, grass, and coarse dirt are not inputs. Soul sand is sifted only when someone has already put it in the input or in their hand.

One sieve processes at most one item per second. Hand use is one item per tap and does not wait for that second.

### How it runs
1. **By hand.** Use the sieve. If you are holding gravel, sand, dirt, or soul sand, that piece is sifted and the result goes to you. Otherwise it takes one valid piece from the input chest and puts the result in the output chest (or into your inventory if there is no output chest). A full destination leaves the input untouched.
2. **Redstone.** The block is a redstone consumer. While `getRedstonePower()` is 1 or more, then once a second, if the input chest has a valid piece and the output chest has room, it sifts one. It does not stop when the chest is empty. The next piece that arrives is sifted while power is still on. Power off means it waits. It does not pause for night.
3. **A Sifter on duty.** Building a worker with a sieve in the barrel (carved pumpkin on top, same as every worker) makes role Sifter and spends one cap slot. The sieve item is used up. `/crew:sift`, or "Sift the sieve I'm looking at" in its menu, links that worker to one sieve (`crew:sieveLink`). While the link is on, the sieve runs the same once-a-second pass as redstone, without power. Night, sleep, Stop, or exhaustion pauses that pass. Morning, Continue, or waking resumes it. Redstone on the same sieve does not sift a second item in the same second. The worker does not pathfind; `runner.js` stays untouched so Miner prospecting can own that file. Come, drop off, and home still use the existing jobs.

### Bonus table (balance)
Each sift rolls a number from 0 to 9999. The first row whose running total passes that roll is the result. One item, or nothing. The input is always used up on a successful sift. Nothing means the piece was sifted and yielded nothing, which is the usual result.

A real game roll is a fixed mix of the sieve's coordinates and how many pieces that sieve has already sifted, so the same sieve and the same count always yield the same result. Mock tests force the roll with `globalThis.crewSiftRoll` (the same idea as `crewTestFast`).

**Gravel** (`minecraft:gravel`)

| Result | Weight | Chance |
| --- | --- | --- |
| flint | 1000 | 10.00% |
| iron_nugget | 250 | 2.50% |
| gold_nugget | 80 | 0.80% |
| coal | 40 | 0.40% |
| lapis_lazuli | 15 | 0.15% |
| raw_copper | 10 | 0.10% |
| emerald | 3 | 0.03% |
| diamond | 2 | 0.02% |
| nothing | 8600 | 86.00% |

**Sand** (`minecraft:sand`)

| Result | Weight | Chance |
| --- | --- | --- |
| iron_nugget | 150 | 1.50% |
| gold_nugget | 60 | 0.60% |
| coal | 30 | 0.30% |
| lapis_lazuli | 10 | 0.10% |
| raw_copper | 8 | 0.08% |
| emerald | 2 | 0.02% |
| diamond | 1 | 0.01% |
| nothing | 9739 | 97.39% |

**Dirt** (`minecraft:dirt`)

| Result | Weight | Chance |
| --- | --- | --- |
| wheat_seeds | 200 | 2.00% |
| iron_nugget | 80 | 0.80% |
| gold_nugget | 20 | 0.20% |
| coal | 15 | 0.15% |
| bone_meal | 50 | 0.50% |
| emerald | 1 | 0.01% |
| nothing | 9634 | 96.34% |

**Soul sand** (`minecraft:soul_sand`)

| Result | Weight | Chance |
| --- | --- | --- |
| quartz | 200 | 2.00% |
| gold_nugget | 120 | 1.20% |
| bone_meal | 80 | 0.80% |
| iron_nugget | 40 | 0.40% |
| coal | 20 | 0.20% |
| glowstone_dust | 10 | 0.10% |
| nothing | 9530 | 95.30% |

No ancient debris and no netherite. A diamond from gravel is about 1 in 5,000. Nuggets are a few in a hundred. Most pieces yield nothing, so sifting does not replace mining.

**Other balance numbers:** one automatic sift every 20 ticks (one second). A Sifter on duty loses 0.05 energy per piece (about 2,000 pieces from full to exhausted). Redstone and hand use do not drain a worker.

### Saved data
- World `crew:sieves`: JSON map of `"<dimension>|<x>,<y>,<z>"` to `{ n }`, how many pieces that sieve has sifted. Used for the roll. Removed when the block is gone.
- Entity `crew:sieveLink`: `{x, y, z, dim}` while that Sifter is on duty at that sieve.
- Entity `crew:sievePaused`: the same shape after Stop, until Continue.
- `crew:role` string `"Sifter"`, and the entity property `crew:role` integer `5`. Hauler already occupies 4, so the property range widens from 0–3 to 0–5. Miner, Digger, Woodcutter, and Farmer stay 0–3. Old saves keep 0–3. No renamed key, so no migration. A mock test still builds a Miner with a pickaxe and reads Miner.

Breaking a sieve in Survival gives the sieve back (the script drops it; Creative does not). An explosion can destroy the block without a drop. The tick forgets a sieve that is no longer there.

## Out of scope
- Miner prospecting (`feat/miner-prospecting`). No edits to `runner.js`, `plans.js`, or prospect files. The entrance chest from that spec is a normal chest; if it sits on a sieve, this sieve reads it.
- Hauler rounds. The Hauler is not changed. A chest it already fills or empties works if the player stacks the sieve under or over it.
- Woodcutter and Farmer plots. This branch starts from `main`, not from `feat/woodcutter-farmer`.
- The Smith, the Builder, and LLM orders.
- Two Sifters sharing one sieve's pace (still one item per second). Teamwork stays on the roadmap.
- Sifting red sand, grass, clay, or gravel the worker digs itself. It never digs.
- A Nether trip for soul sand.

## Done criteria
Every one of these must pass before the branch merges. The reviewer checks each.
1. **Mock tests** (`tools/sim/sifter_test.mjs`, in `run.mjs`, exit non-zero on a wrong result):
   - **Build and cap:** a barrel with a sieve and a carved pumpkin on top makes a Sifter (`crew:role` string Sifter, property 5). The sieve is used up. A shovel alone is still a Digger. A sieve plus a shovel is a Sifter. The Sifter counts toward the worker cap; at the cap the barrel is left as it was. `CAP_DEFAULT` stays 6.
   - **Roles:** a Sifter refuses a quarry. A Digger refuses `sift`. Come, stop, and resume work for a Sifter. Stop pauses the link; Continue picks it up.
   - **Table:** each boundary roll in the four tables above returns that row's item, or nothing.
   - **Chests:** gravel in the input chest becomes the forced yield in the output chest. Ores and other items in the input stay. Red sand and grass are not consumed. A full output chest consumes nothing. Counts: a yield replaces one input (no duplicate); a "nothing" roll removes one input and adds nothing else.
   - **Hand:** holding gravel sifts one into the player's inventory. A full inventory leaves the gravel.
   - **Redstone, ongoing:** power off sifts nothing; power on sifts; power off stops; more input while power is on sifts again.
   - **Duty and night:** a linked Sifter sifts with no redstone during the day, pauses at night, and redstone still sifts at night. Exhaustion sends the Sifter to rest and pauses the duty pass.
   - **Soul sand:** soul sand the player put in the input sifts. The inputs list has no netherrack and no soul soil.
2. **Scenario test on staging:** one sieve, a chest of gravel on top, a chest underneath, redstone on for a short run. Prints `[Crew-Test] PASS sifter`. Not built until layer 2 exists. GameTest stays out of the packs.
3. **Playtest check for Brian:** do a stack of gravel and a stack of sand feel fair, is the chest-on-top / chest-under setup obvious, and is the iron-bar recipe the right cost?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
- **Files:** `crew_bp/scripts/sift.js` (new), `catalog.js`, `orders.js`, `commands.js`, `workers.js`, `tools.js`, `ui.js`, `main.js`, `guide_pages.js`. `crew_bp/blocks/sieve.json`, `crew_bp/recipes/sieve.json`, `crew_bp/loot_tables` is not used (the break drop is scripted). Entity `crew:role` range, client entity, render controller, lang, `tools/make_textures.mjs`, textures. Mock: `getRedstonePower`, `GameMode`. Test: `tools/sim/sifter_test.mjs`.
- **Not touched:** `runner.js`, `plans.js`, `blocks.js`, `life.js`, `marker.js`, `settlement.js`. Miner prospecting can keep the dig loop.
- **Saved data:** `crew:sieves`, `crew:sieveLink`, `crew:sievePaused`, role index 5. No old key renamed.
- **Player-facing text:** CHANGELOG Unreleased, QA.md Next release, guide page "The Sifter", and the build page mentions the sieve.

## Open questions
None.
