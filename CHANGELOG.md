# Changelog

What changed in each release. Add to "Unreleased" as you go; `node tools/release.mjs <version>`
turns it into that version's section.

## Unreleased

- Workers open wooden doors and fence gates as they walk and close them behind them, so a bed
  inside a house is reached on foot (iron doors only when already open). They never break doors,
  gates or trapdoors while digging.

## v0.4.0

**From the first in-game test of v0.4**
- The Survey Stake is now a remote: tap a worker to link it, then tap a bed (its home, from any
  distance), a chest (home chest, drop-off or named place), the ground (plan a dig, then start it
  with that worker) or the air (its orders, your plan, link another worker).
- Dawn (time 23000) counts as morning: workers no longer go to bed at sunrise, and get up then.
- Idle workers with no home now lie down where they are at night, instead of standing all night.
- Planning a dig with the stake no longer loops back to "Quarry or Branch mine": after setting the
  size, tap anywhere with the stake to confirm; extra taps can't stack up menus; a worker given an
  unconfirmed plan offers to confirm it.
- Digging takes as long as a player's would with the same tool and block (hardness), and the block
  breaks at the end of the swing, not the start.
- Workers walk at about a villager's pace and slow down before stopping, so they no longer seem to
  bump into the next block and bounce back.
- Fixed workers snapping back and forth while digging (a finished step was replayed during the swing).
- Clearing a stake plan says that a worker already digging it keeps going.
- Workers keep everything they dig by default, with 36 inventory slots like a player; drop-off
  messages name the chest's position; the menu lists what a worker is carrying.

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
