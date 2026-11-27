# Spec: Woodcutter and Farmer (V1, release week 3)

Owner: Brian · Status: **in review** · Branch: `feat/woodcutter-farmer` · Builder: B (week 3)

<!-- Drafted 2026-11-27 from Brian's answers the same day, FACTORY_PLAN week 3, and the
standing decisions in CLAUDE.md. One spec, two jobs. The cut line is at the end of Decisions. -->

## Player story
"I mark a forest or a field once. My Woodcutter keeps cutting grown trees and planting them
back, and my Farmer keeps the field planted and picks the crops when they're ready. I sleep,
they sleep, and in the morning they go back to it."

## Decisions (from Brian, dated)
- 2026-11-27 **Work mode (Q1):** stake the plot once. It is ongoing. The worker keeps working
  that forest or field every day: cut or harvest when something is ready, sleep at night, resume
  in the morning. Same living-worker routine as the diggers (decision 23).
- 2026-11-27 **Marking (Q2):** the Survey Stake offers **Plan a forest** and **Plan a field**.
  Width and length sliders, outline, confirm, then link the worker and start. Same flow as a
  quarry (decision 11). Slash commands create the same job. The footprint is at most **64 by 64**.
  The worker looks up to **48** blocks above the ground corner (the same cap as Clear above,
  decision 26's 48).
- 2026-11-27 **What a Woodcutter cuts (Q3):** natural trees only. A log or stem that is connected
  to leaves, or the nether equivalent (a stem connected to nether wart block or warped wart
  block). Never planks, fences, chests, furniture, or other built wood. A log with no leaves on
  it stays. Leave beehives and bee nests where they are and report them.
- 2026-11-27 **Replant (Q4):** always replant the same tree on the stump. Saplings come from the
  cut first, then the home chest, then the deposit chest. If there still aren't enough, skip the
  replant and log it. A 2 by 2 trunk gets four saplings, or none if four aren't available.
- 2026-11-27 **Leaves (Q5):** strip the leaves of a tree it cuts. Collect the apples, sticks, and
  saplings those leaves drop.
- 2026-11-27 **What a Farmer plants (Q6):** crops the player provides, as seeds or plantable
  items, from the home chest or the deposit chest (and from what it just harvested). For a nether
  crop such as nether wart, the player must also provide the ground block (soul sand). The Farmer
  does not dig that ground out of the world.
- 2026-11-27 **Field work (Q7):** till empty dirt in the field, plant, harvest when the crop is
  mature, replant the same crop, and use bonemeal the player provided. No cooking. See Open
  questions for water: that part is not guessed.
- 2026-11-27 **Output (Q8):** a deposit chest is required, the same idea as a quarry. The home
  chest is for restocking tools, saplings, and seeds. Keep everything by default (decision 25).
- 2026-11-27 **Cut line:** one spec, two jobs. If the Dec 13 release is tight, Woodcutter ships
  first and the field job can wait. This branch builds both; the field job is the one to drop.
- Standing decisions that still apply: **2** (barrel, 1–5 tools, carved pumpkin, no iron block),
  **3** (an axe is a Woodcutter, a hoe is a Farmer), **5** (never break a block no tool can
  harvest; leave it and log it), **11** (stake outline, facing, sliders, confirm), **12** (the
  villager model and the Woodcutter and Farmer skins already in the pack), **14** (stand on a
  floor with 2 blocks of air, no hovering), **18** (dig a head-height block that is in the way,
  except containers with items, liquids, protected blocks, and blocks the tool can't harvest),
  **19** (one block at a time, the tool's break time, facing the block), **23** (home, sleep,
  energy), **24** (the stake is the remote), **25** (keep all by default; 36 slots; night is
  12000 to 23000), **27** (walk through wooden doors and fence gates; never break them), **31**
  (only break what it can see; walk, don't teleport, to a spot with a view), **32** (hard role
  split: a Woodcutter refuses every other role's job, and the others refuse `forest`; a Farmer
  and `field` the same way).

## Out of scope
- Cooking meals (PLAN.md still says the Farmer cooks; Brian, 2026-11-27, says no).
- Placing water. The pattern is an open question below. The player puts water in the field.
- Pumpkin and melon fruits, sweet berries, sugar cane, cactus, bamboo, and cocoa. They don't
  grow as one aged block on one spot. Listed below rather than invented.
- The Hauler picking up these deposit chests. That stays on `feat/hauler`.
- A second worker sharing the same plot. Nothing coordinates them.

## Done criteria
1. **Mock tests** (`tools/sim/plots_test.mjs`, in `run.mjs`, exit non-zero on a wrong result):
   - **Build and roles:** an axe in the barrel makes a Woodcutter, a hoe makes a Farmer. A
     Woodcutter refuses a quarry and a field. A Farmer refuses a forest. A Digger refuses both.
     Come, stop, and resume still work.
   - **Footprint:** a plan or order bigger than 64 by 64 is refused. The scan is at most 48
     blocks above the ground corner.
   - **Forest:** a log connected to leaves is cut, the leaves go too, and the sapling from the
     cut is planted on the stump. Planks, a lone log with no leaves, and a chest stay. A bee
     nest stays and is reported. With no sapling from the cut and none in the home or deposit
     chest, the replant is skipped and logged. A 2 by 2 trunk gets four saplings when four are
     on hand.
   - **Field:** empty dirt is tilled and planted with a seed the player provided. A mature crop
     is harvested, the yield goes to the deposit, and the same crop is replanted. Nether wart
     is not planted on dirt unless the player has provided soul sand. One bonemeal the player
     provided advances a crop one stage. Nothing is cooked.
   - **Ongoing:** after a pass the job is still the forest or the field. At night the worker
     sleeps and in the morning the same plot resumes.
   - **Path:** when a walk can go around a crop, the path does not step on that crop.
   - **Counts:** logs, apples, sticks, and crop yields that were dropped are in the deposit or
     still carried. Nothing is lost. Tools, torches, and food stay in the kit.
2. **Scenario test on staging:** a small oak and a wheat plot, deposit chest, one in-game day.
   Prints `[Crew-Test] PASS woodcutter-farmer`. Not built: layer 2 does not exist, and GameTest
   stays out of the packs.
3. **Playtest check for Brian:** one Woodcutter on a real oak and one Farmer on a wheat field
   for an in-game day. Do the replants look right, and does the Farmer leave your water alone?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
- **Files:** new `crew_bp/scripts/plots.js` (tree and crop rules, the ongoing pass). `catalog.js`
  (`forest`, `field`), `orders.js`, `commands.js` (`/crew:forest`, `/crew:field`), `marker.js`
  (Plan a forest / Plan a field), `ui.js` (menu), `runner.js` (run the pass, pause it at night
  like a dig), `path.js` and `blocks.js` (don't step on crops when another way exists),
  `life.js` (morning restock of saplings and seeds), `guide_pages.js`.
- **Saved data:** the plot is the job in `crew:job` / `crew:paused`, same as a quarry. No new
  dynamic property id.
- **Player-facing:** CHANGELOG, QA.md checks, a guide page "Forests and fields". Skins already
  exist; this feature does not redraw them.

## Open questions
1. **Water.** Q7 says the Farmer places water. It does not say where, how many sources, or
   whether a water bucket is emptied and put back. Until that's answered the Farmer does not
   place water. The player puts water in the field. The rest of the field job does not depend
   on this.
2. **Crops that grow a neighbor block** (pumpkin, melon, cocoa) or that aren't one aged block
   (berries, cane, cactus, bamboo). Q6 says anything plantable the player provides. The shape
   of those plants isn't specified. The Farmer skips them and says so, and plants the aged
   crops it does know: wheat, beetroot, carrot, potato, torchflower, pitcher pod, and nether
   wart on soul sand the player provided.
