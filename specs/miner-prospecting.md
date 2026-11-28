# Spec: Miner prospecting (V1, release week 4)

Owner: Brian · Status: **building** · Branch: `feat/miner-prospecting` · Builder: B

<!-- Brian answered every open question on 2026-11-27, so this spec is not a draft.
Status stays building while the pull request is open (knowledge/skills/spec-status.md). -->

## Player story
"I send my Miner into the ground around its home, or I stake a start with the Survey Stake. It digs its own mine, hunts whatever ore it uncovers, and leaves the ore in a chest at the entrance. It stops at night, when it runs out of pickaxes, or when that ground is mined out. I can also tell it to stop after a certain number of one ore."

## Decisions (from Brian, dated)
- 2026-11-15 (CLAUDE.md decision 32): the Miner (pickaxe) is the one that goes after ore. There is no separate Prospector. `branch_mine` stays hidden and Miner-only so prospecting can reuse it. Come, stop, resume, status, drop off, and home stay open to every role.
- 2026-11-16 (FACTORY_PLAN): builder B builds Miner prospecting on the existing branch-mine code.
- 2026-11-27 **Where:** the Miner prospects either (a) in the area around its bed and home, and that home must be protected so the mine never digs it, or (b) from a start the player stakes with the Survey Stake.
- 2026-11-27 **What:** it always hunts any valuables. An optional quota counts one ore (coal, copper, iron, gold, redstone, lapis, emerald, or diamond) and the mine stops when that many blocks of it have been dug. It also stops at night, when it runs out of pickaxes, or when the area is mined out. No x-ray: it only knows ore it has uncovered.
- 2026-11-27 **Entrance:** a paid wooden entrance. Wood comes from the home chest, or from a deposit chest. Cost is 8 planks, and one log counts as 4. The entrance is log or plank posts, a plank beam, a lantern if one is in that chest, and a sign. The sign's automatic name is like "Digby's Diamond Mine No. 1" (the ore word is used when a quota is set; otherwise "Digby's Mine No. 1"). A text field lets the player type a name instead. An entrance chest holds the ore. If the wood or a chest is missing, skip the wooden build, say so, and use a chest the player placed. The Hauler collects that chest like any other drop-off. The home chest is not the ore chest.
- 2026-11-27 **Dimension:** overworld only in V1. No Nether. Ancient debris waits.
- 2026-11-14 (docs/PLAN.md, still in force): when the pickaxe is gone and a crafting table is within 8 blocks of the bed, the Miner makes a replacement from the home chest, using vanilla recipes, never a higher tier than the tool it lost. Netherite is not made at a crafting table (diamond is the best it can make). It says what it made and what it used. With no materials it asks and does not invent a tool.
- Standing, used as written and not re-opened: no x-ray (PLAN); home every night and the dig resumes in the morning (decisions 23 and 25); an order given at night keeps the worker up until that order is done (decision 28); torches close enough that monsters cannot spawn (decision 16); ore veins in the walls are dug and the holes filled (decision 15); 2 solid blocks between branches (decision 10); trunk 2 wide; keep everything dug, so gravel, sand, and dirt stay in the chest (decision 25); one moving ticking area (the world's limit of 10); mobs cannot hurt workers yet.

Numbers this build uses because the Nov 27 answers need a finite mine and did not replace them:

- **Claim:** 64 blocks from the entrance, a square (the cap in the Nov 27 draft, the same footprint a forest or field was given). The menu and the stake use 64. A slash order or test may pass 4–64.
- **Home column:** 8 blocks, the distance already used for the home chest (decision 23), around the bed, the foot of the bed, and the home chest, at every depth. A staked start inside that column is refused. A tunnel that would enter it is skipped.
- **Depth (Brian, 2026-11-27, second pass):** one shaft and one entrance. Each branch level is the best Y for an ore in current overworld generation (Caves & Cliffs rules, Bedrock since 1.18, still the ranges on the Minecraft Wiki ore-feature table). A quota uses that ore's level. No quota adds every band whose peak is at or below the start, so one mine has many levels and each level has many branches. The levels are saved on `crew:mine.levels` as `{y, ores, peak}`. Diamond and redstone share a level. The stair stays a shaft with cobblestone treads. At each level the hidden branch mine runs: 2-wide trunk, branches, 2 solid blocks between them, torches on the same spacing.

  | Ore | Branch Y | Why |
  | --- | --- | --- |
  | Coal | 136, or 96 if the start is below 136 | The even band from Y 136 to the top of the world gets more attempts per layer than the triangle that peaks at Y 96. Both are above a typical Y 64 start, so a coal quota there branches at the entrance and records peak 136. |
  | Copper | 48 | Triangle from Y -16 to 112, center 48. |
  | Iron | 16, or 232 if the start is at or above 232 | Underground triangle from Y -24 to 56, center 16 (Bedrock's blob is one block larger than Java's; the heights match). The mountain triangle centers at 232 and is only a downward level when the entrance is already that high. |
  | Emerald | 232 | Mountain triangle. Only a no-quota level when the entrance is at or above 232. A quota below that branches at the entrance and records peak 232. |
  | Lapis | 0 | Triangle from Y -32 to 32, center 0. |
  | Gold | -16 | Triangle from Y -64 to 32, center -16. Badlands gold higher up is not a separate level. |
  | Diamond and redstone | -59 | Both triangles are centered on the bedrock floor (Y -64). Bedrock fills Y -64 and can reach a few layers above it, so a 2-block tunnel stands at Y -59, the lowest clear layer and the measured layer where the most of both ores is found. |
- **Caves and lava:** ore the Miner can see through air it just opened is taken (a short look, not a scan through stone), then it returns to the tunnel. Lava in a block it was going to dig is sealed with cobblestone it is carrying, or left in place if it has none. Water is left in place.

## Out of scope
- The Sifter (`feat/sifter`). This branch does not edit Sifter files. See the handoff below.
- Offering `branch_mine` as a player order again.
- The Nether, ancient debris, portals.
- `scout`, ranks, personality, two Miners on one claim, catch-up for unloaded areas.
- The Smith. Home crafting of a replacement pickaxe is the Nov 14 rule, not the Smith.
- Hauler rounds. The entrance chest is an ordinary drop-off (`crew:lastDeposit`). This branch does not edit Hauler code.
- A new skin. The Miner skin already exists.

## Handoff to the Sifter
The Sifter is being built in parallel on `feat/sifter`. It should use a Miner's ore chest as a normal material chest, not a private inventory.

- The chest is a vanilla `minecraft:chest`. Items in it are vanilla stacks. Gravel, sand, dirt, and ores are kept (`keep` is `all` for a prospect).
- The coordinate is saved on the worker as `crew:mine.chest` (`{x, y, z, dim}`) and as `crew:lastDeposit`. `crew:mine.handoff` is `"sifter-chest"`.
- `crew:mine` is absent on a worker that has never prospected. Old saves need no migration beyond that absence.
- Do not import Sifter modules from this feature, and do not add a Sifter job here.

## Done criteria
1. **Mock tests** (`tools/sim/prospect_test.mjs`, in `run.mjs`, exit non-zero on a wrong result):
   - **Roles:** a pickaxe still makes a Miner. A Miner refuses quarry. A Digger refuses `prospect` and the message names the Miner. A player still cannot order `branch_mine`. Come still works. `prospect` is in the catalog and the tool list; `branch_mine` stays hidden.
   - **Where:** `where: home` with no bed is refused. A staked start inside the home column is refused. The dig list for a mine aimed at the bed contains no cell within 8 blocks of the bed. A Nether worker is refused. Ancient debris is refused.
   - **Pattern:** with no quota and a start at Y 64, the levels are Y 48, 16, 0, -16 and -59 (diamond and redstone together). A diamond quota is only Y -59. An iron quota is only Y 16. A coal quota from Y 64 is the entrance, with peak 136 recorded. A coal quota from Y 200 is Y 136. Every level is 2 wide with 2 solid blocks between branches. Stair steps carry torch marks. A short two-level mine digs both floors. A diamond that is not on the tunnel and not connected by air is not in the dig list and is still in the ground after a quota run.
   - **Stop:** a quota of 1 diamond stops the job and that diamond is in the entrance chest or still carried. A small mine reports that the area is mined out. Night pauses the mine; morning resumes it.
   - **Entrance:** with 2 logs and a chest in the home chest, the wooden entrance is built, the sign text is the automatic or typed name, the chest item and the logs are consumed, and `crew:mine.handoff` is `sifter-chest`. With no wood and a chest the player placed, the posts are skipped, the message says so, and that chest is the ore chest. With no chest at all, the order is refused. The home chest block is not removed. Gravel dug from the mine is in the entrance chest.
   - **Crafting:** with a stone-tier cap and both cobblestone and diamonds in the home chest, the replacement is a stone pickaxe. A netherite-tier cap with diamonds makes a diamond pickaxe and says netherite cannot be made at a crafting table. A worn-out wooden pickaxe, planks in the home chest, and a crafting table by the bed produce a new wooden pickaxe, not a better one.
2. **Scenario test on staging:** one Miner, a staked start or a home, "prospect, quota 5 diamonds" over more than one in-game day, with an entrance chest. Prints `[Crew-Test] PASS prospect`. Not built until layer 2 exists. GameTest stays out of the packs.
3. **Playtest check for Brian:** does the entrance and the sign look right, and does a short prospect around a home leave the bed and the house standing?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
- **Files:** `crew_bp/scripts/prospect.js` (new), `plans.js` (prospect geometry on top of `branchGeom`), `catalog.js`, `orders.js`, `commands.js` (`/crew:prospect`), `marker.js` (a linked Miner plans a mine), `ui.js`, `runner.js` (entrance, home column, quota, lava seal, cave ore, crafting trip), `guide_pages.js`. Not `life.js` (morning restock of tools already exists). No Sifter file. No Hauler file. No new texture (Miner skin is unchanged).
- **Saved data:** `crew:mine` (JSON: name, number, chest, decorative, quotaOre, handoff) and `crew:mineCount` (number) on the worker. `crew:lastDeposit` points at the entrance chest. The job itself stays in `crew:job` / `crew:paused`. Missing `crew:mine` means the worker has never prospected.
- **Player-facing:** CHANGELOG, QA.md, guide page "Prospecting".
- **Base branch:** `main`. The Survey Stake on `main` already marks a ground start. This feature does not need the forest or field plot code on `feat/woodcutter-farmer`.

## Open questions
None. Brian answered where, what, the entrance, and the Nether on 2026-11-27.
