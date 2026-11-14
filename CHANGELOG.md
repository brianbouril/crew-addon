# Changelog

What changed in each release. Add to "Unreleased" as you go; `node tools/release.mjs <version>`
turns it into that version's section.

## Unreleased

**Living workers (v0.4 plan): home and daily routine**
- A home: a claimed bed (one worker per bed) and a home chest, set from the worker's Home menu.
- Workers sleep from dusk to dawn: the dig pauses, they walk home, unload and sleep, then restock
  torches, food and tools in the morning and carry on where they left off.
- Energy: digging tires them out (slower when tired, a rest when worn out). Sleep restores it, and
  food does too (never required). Safe beds (roof, no monsters nearby) rest them fully.
- Sleeping and eating animations.

**Better digging (v0.3 plan)**
- Villager-style workers in hard hats, a skin for each job; the tool in use shows in their hand.
- Digs one block at a time like a player; never hovers or passes through blocks; clears diggable
  blocks at head height.
- Mines ore veins in tunnel walls and fills the holes; places torches so monsters can't spawn.
- Branch mine trunk width 1 to 4.
- Take what it carries, Drop off at a chest, Stop and drop off, Continue where it left off.
- Get a Survey Stake from the worker menu; Put the stake away.
- In-game guide: `/crew:help`.

## v0.2.0

The hand-off build: quarry and branch mine jobs, tool kits, crouch menu, permissions, Survey Stake
planner, named places, slash commands.
