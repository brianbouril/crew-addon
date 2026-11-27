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
  mature, replant the same crop, and use bonemeal the player provided. No cooking.
- 2026-11-27 **Water (Brian, on the review):** the Farmer places a water channel every 9 blocks
  across the field, which is vanilla's hydration range (farmland stays within 4 blocks of
  water). The channels run along the longer side. A square field's channels run east-west.
  Along the other side, each band of 9, and the shorter band at the end, gets one water row
  through its middle. The water comes from water buckets in the home chest or the deposit.
  Placing one empties the bucket, and the empty bucket goes to the deposit. If there is no
  bucket, the Farmer skips the channel and says so. It does not take water from the world.
- 2026-11-27 **The other crops (Brian, on the review):** plant these as well, and only from
  what the player provides. The player also provides any special ground. Report it when that
  ground is missing. Do not dig it up and do not invent a substitute.
  - Pumpkin and melon: the stem stays. Harvest the fruit beside it.
  - Cocoa: on jungle logs the player provides. Harvest the pod when it is grown and replant it.
  - Sweet berries: pick the bush when it has berries. Do not break the bush.
  - Sugar cane, cactus, and bamboo: leave the base. Harvest everything above it. Cane and
    cactus need sand from the player. Cactus only goes where all four sides are empty. Cane
    only goes on sand with water beside it.
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
   - **Water:** on a field longer than it is wide, the water row runs the long way, through the
     middle of each 9-block band. Buckets come from the player. No bucket: the row is skipped
     and reported, and no water is taken from the world.
   - **Other crops:** a pumpkin or melon stem is left and the fruit is taken. Cocoa is planted
     on a jungle log and replanted after the pod is picked. A berry bush is picked back to age
     1, not broken. Cane, cactus, and bamboo keep their base. Cane and cactus are not planted
     without sand the player provided. Cactus is not planted against another block.
   - **Ongoing:** after a pass the job is still the forest or the field. At night the worker
     sleeps and in the morning the same plot resumes.
   - **Path:** when a walk can go around a crop, the path does not step on that crop.
   - **Counts:** logs, apples, sticks, and crop yields that were dropped are in the deposit or
     still carried. Nothing is lost. Tools, torches, and food stay in the kit.
2. **Scenario test on staging:** a small oak and a wheat plot, deposit chest, one in-game day.
   Prints `[Crew-Test] PASS woodcutter-farmer`. Not built: layer 2 does not exist, and GameTest
   stays out of the packs.
3. **Playtest check for Brian:** one Woodcutter on a real oak and one Farmer on a wheat field
   for an in-game day. Do the replants look right, and does the water row sit every 9 blocks?
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
None. Brian answered the water layout and the remaining crops on 2026-11-27.
