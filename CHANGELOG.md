# Changelog

What changed in each release. Add to "Unreleased" as you go; `node tools/release.mjs <version>`
turns it into that version's section.

## Unreleased

- **Sieve and Sifter.** Craft a sieve from eight iron bars around a stick. Set a chest on top
  (gravel, sand, dirt, or soul sand) and a chest underneath. Use it by hand for one piece, or
  power it with redstone and it keeps sifting whenever more input arrives. Most pieces yield
  nothing; gravel sometimes gives flint, and a gem is rare. Soul sand only sifts if you supply
  it. Ore in the input chest is left alone. A sieve in the barrel builds a Sifter, which counts
  toward your worker limit and can mind one sieve during the day.

- **Settlements.** Place a bell yourself and crouch-tap it to found a settlement and name it. Every
  worker you build belongs to it, including the ones you already have. Crouch-tap the bell for the
  settlement menu: **Workers** lists all of them with what each is doing and where, who's **Out of
  tools** or has **Tools low**, and which far-away workers are still working or paused. Tap one for
  its menu; orders to a far-away worker wait until its area loads, and a worker that was killed can
  be forgotten there so it stops counting toward the limit. Add friends as **members**: everyone
  in a settlement runs it together (their workers become the settlement's and stay if they leave;
  everyone can give orders to every worker,
  add and remove members, rename it and move its bell). The **founder** can't be removed and can
  hand that role to another member. The bell
  can't be broken (explosions skip it too): **Move the bell** in the menu puts it in your inventory.
  A plain tap still rings it, and village bells can't be claimed.
- **Storage.** The settlement menu adds up everything in your settlement's chests (your workers'
  home chests and drop-offs, your named places, and any chest you add by tapping it with the Survey
  Stake), most first; tap an item to see which chests hold it. It keeps up as you and your workers
  put things in and take them out; chests far away show what they held when last loaded.
- **Orders to everyone.** From the bell: Stop, Continue, Drop off, Go home or Come to the bell, for
  all your settlement's workers or one kind (All Diggers). Far-away workers do it when they load.
  Workers also understand "go home" and "come to a place" as orders on their own.
- **Worker limit.** A settlement can have 6 workers for each person in it, and a player on their
  own 6, so the server keeps running smoothly.
  Building one more is refused and leaves the barrel and tools as they were; workers you already
  have past the limit keep working. Operators change it in the settlement menu or with
  `/crew:cap <number>`.

- **Diggers and Miners.** The first tool you put in the barrel sets a worker's job: a shovel makes
  a **Digger**, which digs quarries (give it pickaxes too, for stone); a pickaxe makes a **Miner**,
  which will prospect for ore in the next version. Each only takes its own jobs and says who to
  ask for the rest. Workers built before this update become Diggers (they say so once), and keep
  whatever they were digging.
- **Branch mine is no longer a job you can order** (menu, Survey Stake, commands): it comes back
  inside the Miner's prospecting. A branch mine already started can still be continued.

- Workers walk through invisible light blocks (placed by dynamic-light add-ons) instead of treating
  them as walls, which boxed them in and made them take a shortcut. They never dig them.
- A worker going to a chest stops where it can see the chest, so a chest against the inside of a
  house wall is reached through the door, not from outside the wall. If it ever has to take a
  shortcut to a chest, it lands beside the chest on the same side, not on the roof above it.

- The quarry Depth slider now says it counts blocks down and shows the top layer's Y, and the
  plan summary says where the bottom ends up ("down to Y 45"). Players read it as a Y level and
  looked for a negative number (reported on Xbox).

- Four commands are renamed because their short forms clashed with vanilla commands:
  `/crew:stop` is now `/crew:halt`, `/crew:list` is `/crew:workers`, `/crew:help` is
  `/crew:guide` and `/crew:place` is `/crew:setplace`. Like the other crew commands, they now also
  work without the `crew:` prefix (`/halt Digby`, `/workers`, `/guide`).
- Workers open wooden doors and fence gates as they walk and close them behind them, so a bed
  inside a house is reached on foot (iron doors only when already open). They never break doors,
  gates or trapdoors while digging.
- Quarry "Clear above" (on by default when planned with the stake): the worker first clears
  everything over the box up to open sky, top down, so no hill, tree or overhang is left floating.
  The outline shows the full height; a quarry staked underground (over 48 blocks overhead) is refused.
- A worker waiting for a tool now takes one put in the chest it's waiting at, or walks to its home
  chest for one, and goes back to work. Workers stand beside chests, not on top of them.
- Restarting a quarry that was already partly dug no longer walks the worker through every dug-out
  spot: it skips them and heads straight for the first block still there.
- A sleeping worker can be crouch-tapped (or its bed) for its menu and keeps sleeping; **Wake up**
  gets it up, and so does any order. Woken at night, it stays up while it has a job, then goes back
  to bed after about a minute idle.
- Tools menu: **Use the fastest tool** (its best tool for everything) or **Save my best tools**
  (the default: the weakest tool that works, saving good ones for ore).
- Workers only dig blocks they can see, with nothing solid in the way; if one can't, it walks to
  where it can. If a worker ever ends up inside a block, it steps out (and the log says so).
- Removed the Fast pace: workers always dig at player speed.

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
