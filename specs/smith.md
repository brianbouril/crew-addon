# Spec: Smith

Owner: Brian · Status: **ready** · Branch: `feat/smith` · Builder: Worker

<!-- Every question in the Nov 27 draft was answered by Brian on 2026-11-27, including the
later note that smelting is in scope. This file records those answers and the station layout
chosen from them. Balance numbers (recipe cost, fuel rounding, stock size, repair amount)
are recorded so they can be retuned after playtest. They are not open questions. -->

## Player story
"I put an anvil in a barrel and a carved pumpkin on top, and I get a Smith. I place a forge, a chest of fuel on top, and a chest underneath. It smelts ore from the depot into ingots, then makes tools, weapons, and armor, and it can repair them. On its own it leaves a couple of wooden tools for each of my workers. When a pickaxe breaks, that worker walks to the Smith's chest and takes a replacement. If there is no Smith, or no tool it is allowed to take, it waits and tells me. It does not craft one at home."

## Decisions (from Brian, dated)
- 2026-11-16 (docs/PLAN.md; specs/settlement-layer.md): the Hauler's depot is the central store of raw materials. A Smith takes what it needs from the depot to make tools and weapons, and keeps what it makes in its own storage chest. Both the depot and that chest count in the settlement ledger.
- 2026-11-17 (specs/settlement-layer.md): the base cap is 6 in V1 and 8 once the Smith and the Builder exist. Each worker's spec sets its build cost.
- 2026-11-18 (docs/PLAN.md; specs/hauler.md): Hauler delivery of spare tools is not part of the Hauler. It is not part of this spec either.
- 2026-11-27: **Build.** An anvil in the barrel, carved pumpkin on top.
- 2026-11-27: **Work.** Tools, weapons, player armor, horse armor, and repairing all of those.
- 2026-11-27: **Schedule.** On its own, it crafts a couple of low-quality tools for each worker in the settlement. It also takes player orders for anything in scope, through the order catalog or the menu.
- 2026-11-27: **Station.** A custom forge block, like the sieve, with a texture that has a black outline. The chest pattern below is the layout.
- 2026-11-27: **Materials.** From the Hauler depot and settlement chests. Not from a home chest.
- 2026-11-27 (update the same day): **Smelting is in scope.** The Smith smelts raw ore from the depot and settlement chests into ingots, and other vanilla smeltables that its own work uses, at the forge. Fuel is coal, charcoal, lava, wood, and planks. It then uses those ingots for tools, weapons, armor, and repairs. Smelting is not a follow-up.
- 2026-11-27: **Fuel.** Coal, charcoal, and lava, plus wood and planks.
- 2026-11-27: **Tiers.** The Smith takes over all tool making. This replaces the Nov 14 rule that a worker crafts a replacement at home (the `craftPickaxe` path). Workers fetch a replacement from the Smith's chest. The fallback when there is no Smith, or no tool it may take, is to wait and say so.
- 2026-11-27: **Cap.** The default worker cap is 8 now, ahead of the Builder. The Smith is role index 6, after the Sifter (5).
- 2026-11-27: **Delivery.** Workers walk to the Smith's chest and pick up their tools. The Hauler does not deliver them.
- 2026-11-27 (specs/dev-mode.md): dev mode can spawn every role. It follows `ROLE_LIST` and does not hardcode a skin index. A Smith is on that list, and dev mode can give a forge.
- Standing rules that still apply: stable Script API only; never change pack UUIDs or the `crew:` namespace; hard role split (a Smith refuses dig, haul, forest, field, sift, and prospect; those roles refuse the Smith's job); come, stop, resume, status, drop off, and home stay open to every role; the same daily routine; walk, don't teleport; the Smith's chest counts in the ledger once the forge is linked inside a settlement.

## Design choices (builder, 2026-11-27)

These follow the answers above. Brian can retune the balance numbers after playtest.

### The worker
One `minecraft:anvil` in the barrel is the build kit. It is used up. A stack keeps the extras. An anvil wins over a sieve or tools in the same barrel: the worker is a Smith, and the other items stay in its inventory. Role string `Smith`, entity property `crew:role` integer `6`. Miner through Sifter stay 0–5. `CAP_DEFAULT` is 8.

### The forge block
Placeable block `crew:forge`. The item and the block share one 32×32 picture with a `#000000` outline, the same rule as the sieve. The Smith skin is a separate 64×64 villager texture (index 6): a dark cap, rolled sleeves, and a soot-stained apron. The cap is not black and not the Miner lamp.

**Recipe (balance):** shaped, one forge.

```text
I I I
I F I
C C C
```

`I` is `minecraft:iron_ingot`, `F` is `minecraft:furnace`, `C` is `minecraft:coal`. Six ingots, one furnace, three coal. The anvil in the barrel is the expensive part of hiring the worker. The forge is the station, cheaper than an anvil, so it can be placed first.

### Chests
The forge is not a container.

| Place | What it is |
| --- | --- |
| On top of the forge | **Fuel chest.** Coal, charcoal, lava buckets, logs, wood, stems, hyphae, and planks. Ore and other craft materials may sit here too. |
| Under the forge | **Output.** The Smith's storage chest. Ingots, tools, weapons, and armor land here. This is the chest other workers walk to. |
| Depot chests and other settlement storage | **Materials.** Raw ore, ingots, planks, leather, gems, and items to repair. |

A home chest is never a material source, even when the ledger counts it. The output chest is not a smelting input and is not fuel: ingots the Smith just made stay there until a craft uses them. With no settlement, the fuel chest is the only input and the chest underneath is still the output. The Smith says what is missing and waits.

Linking a forge inside a settlement adds the output chest to that settlement's storage, so the ledger counts it. The Hauler's round does not pick up every storage chest, so this does not start Hauler delivery.

### Smelting
One item per second while the Smith is at the forge. Vanilla results for the metals it uses:

| Input | Result |
| --- | --- |
| raw iron, iron ore, deepslate iron ore | iron ingot |
| raw gold, gold ore, deepslate gold ore, nether gold ore | gold ingot |
| raw copper, copper ore, deepslate copper ore | copper ingot |
| ancient debris | netherite scrap |

Food, sand, cobblestone, and logs are not smelted. Logs and planks are fuel only. A raw metal block or a metal block can be unpacked (9 pieces) when a smelt or a craft is short. Nine nuggets make one ingot the same way. That unpack is crafting, not a second furnace recipe.

**Fuel (balance).** Charges left over stay on the forge (`crew:forges`).

| Fuel | Items smelted |
| --- | --- |
| coal, charcoal | 8 |
| lava bucket | 100, and the empty bucket goes back |
| one log, wood, stem, hyphae, or plank | 1 |

Vanilla logs and planks smelt 1.5 items. This pack rounds that down to 1 so one log never smelts two, and the forge does not store half an item. Sticks, slabs, doors, and crafted wood are not fuel.

Smelting runs on its own while ore and fuel remain, and when a craft or repair needs an ingot the chests do not have yet. A player can also order a smelt. The Smith does not smelt the output chest.

### What it makes
Vanilla crafting counts. Sticks come from the chests, or from planks (2 planks make 4 sticks) when a recipe is short.

| Kind | Materials |
| --- | --- |
| pickaxe | 3 + 2 sticks |
| shovel | 1 + 2 sticks |
| axe | 3 + 2 sticks |
| hoe | 2 + 2 sticks |
| sword | 2 + 1 stick |
| helmet, chestplate, leggings, boots | 5, 8, 7, 4 |

Tool and sword materials: wooden (planks), stone (cobblestone), copper, iron, gold, diamond. Armor materials: leather, copper, iron, gold, diamond. Chainmail is not crafted.

**Horse armor.** Leather is the vanilla 7 leather. Iron, gold, and diamond horse armor have no vanilla crafting recipe; the Smith makes them for 6 of that material. There is no copper or netherite horse armor.

**Netherite.** A diamond tool, weapon, or armor piece, plus one netherite ingot and one netherite upgrade template, becomes the netherite piece. The Smith does not invent a template.

**Weapons** in this spec are swords. Axes are already tools. Bows, crossbows, and tridents are not forged here.

### Repair
One material restores a quarter of that item's max durability (at least 1 point), the vanilla anvil unit. The material matches the item: planks, cobblestone, copper, iron, gold, diamond, netherite ingot, or leather. Chainmail takes an iron nugget. The item stays in the chest it was in (the output chest, the depot, or other settlement storage). Horse armor that has no durability is not worn down, and the Smith says there is nothing to repair.

### On its own, and on order
The job is `smith` (`/crew:smith`, or the forge form in the Smith's menu).

| Action | What it does |
| --- | --- |
| `stock` (the default, and what it does with no order) | Smelt ore as above, and keep **2 wooden tools** of each tool-using worker's main kind in the output chest. Miner: pickaxe. Digger: shovel. Woodcutter: axe. Farmer: hoe. Haulers, Sifters, and the Smith get none. Two miners means four wooden pickaxes. It does not upgrade them. |
| `craft` | Make `count` of one item at a chosen tier. |
| `repair` | Spend `count` materials on a matching damaged item. |
| `smelt` | Smelt `count` of one ore, or any smeltable ore when the item is `ore`. |

Low-quality means wooden. A couple means 2. It walks to a far chest, carries what that step needs, and walks back to the forge. It sleeps at night and resumes in the morning. Stop pauses it. Continue starts it again. A player's Stop also keeps it from starting a new stock until Continue.

### Replacement tools
When a worker's tool breaks and it has no spare of that kind, it walks to a Smith's output chest (same owner, or the same settlement) and takes one tool of the right kind. It takes the best tier that is **not above** the tool it lost. If it never had a tier, it takes the lowest. A wooden pick that broke does not take a diamond pick. The diamond stays for an order or for a worker that lost a diamond tool.

If there is no linked forge, or no tool it may take, it says so and waits at its deposit. It does not craft at a crafting table. A tool the player puts in the deposit or the home chest is still picked up, as before. `craftPickaxe` is not called by the job loop.

### Saved data
- World `crew:forges`: JSON map of `"<dimension>|<x>,<y>,<z>"` to `{ fuel }`, unused smelt charges. Removed when that forge block is gone.
- Entity `crew:forge`: `{x, y, z, dim}` of the forge this Smith works.
- Entity `crew:smithOff`: set when a player stops the Smith, cleared on Continue or a new smith order.
- `crew:role` string `"Smith"` and integer `6`. No old key is renamed. A mock test still builds a Miner with a pickaxe.

## Out of scope
- The Builder, and LLM-driven orders.
- Hauler delivery of the Smith's tools.
- A separate smelting job, a second furnace block, or smelting food.
- Bows, crossbows, tridents, and chainmail crafting.
- Netherite without a template and an ingot the chests already hold.
- Workers crafting replacement tools at home.

## Done criteria
Every one of these must pass before the branch merges. The reviewer checks each.
1. **Mock tests** (`tools/sim/smith_test.mjs`, in `run.mjs`, exit non-zero on a wrong result):
   - **Build and cap:** an anvil and a carved pumpkin make a Smith (`crew:role` string Smith, property 6). The anvil is used up. An anvil plus a shovel is a Smith. A shovel alone is still a Digger. The Smith counts toward the cap. `CAP_DEFAULT` is 8.
   - **Roles:** a Smith refuses a quarry. A Digger refuses `smith`. Come, stop, and resume work for a Smith.
   - **Smelt:** raw iron and one coal become ingots, eight from that coal, with no leftover ore and no duplicate ingots. A log smelts one item, not two. A lava bucket smelts one and comes back empty. A plank smelts one. Beef and sand are not smelted. Ore in a home chest is not taken. Ore in a depot chest is smelted into the output chest.
   - **Craft and repair:** an iron sword, a leather helmet, and an iron horse armor match the counts above. A diamond pick plus a netherite ingot and a template becomes a netherite pick. One iron ingot on a damaged iron pick restores a quarter of its durability. Undamaged horse armor is not changed.
   - **Stock:** one Miner in the settlement gets two wooden pickaxes in the output chest, and not a third. A Hauler does not add a tool.
   - **Replacement:** a Miner that breaks a wooden pick walks to the Smith's chest, takes the wooden pick, and leaves a diamond pick there. With no Smith, and with planks and a crafting table at home, it does not craft, and it says it is waiting on a Smith.
   - **Dev mode:** with dev mode on, an operator can spawn a Smith and a forge block is placed when the block exists.
2. **Scenario test on staging:** one Smith, a forge, fuel, a depot chest of raw iron, one in-game day. Prints `[Crew-Test] PASS smith`. Not built until layer 2 exists. GameTest stays out of the packs.
3. **Playtest check for Brian:** is the forge obvious (fuel on top, results underneath), does a short run of iron tools feel fair, and does a Miner without a Smith wait instead of crafting at home?
4. **No new script errors** in the staging server log over a 30 minute run.

## Touches
- **Files:** `crew_bp/scripts/smith.js` (new). `catalog.js`, `orders.js`, `commands.js`, `workers.js`, `tools.js`, `ui.js`, `runner.js` (the home-craft step becomes a walk to the Smith's chest; the smith job is one branch in the tick), `settlement.js` (`CAP_DEFAULT` only), `devmode.js`, `guide_pages.js`. Not `hauler.js`.
- **Entity and pack:** `crew:role` range 0–6. Skin in `tools/make_textures.mjs`, the client entity, and the render controller. Block `crew_bp/blocks/forge.json`, recipe `crew_bp/recipes/forge.json`, item and block textures, lang lines.
- **Saved data:** `crew:forges`, `crew:forge`, `crew:smithOff`. No old key renamed.
- **Player-facing text:** CHANGELOG, QA.md, guide page "The Smith", the prospecting page (no home crafting), the settlement cap, and dev mode.
