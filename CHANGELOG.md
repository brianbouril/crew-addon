# Changelog

What changed in each release. Add to "Unreleased" as you go; `node tools/release.mjs <version>`
turns it into that version's section.

## Unreleased

- **Survey Stake icon.** The item picture is larger: the same wooden stick and orange checkered flag, now with a black outline.
- **Woodcutter and Farmer.** An axe in the barrel makes a Woodcutter, a hoe makes a Farmer. With
  the Survey Stake, Plan a forest or Plan a field (width and length, up to 64 by 64, outline,
  confirm), or use `/crew:forest` and `/crew:field`. The plot keeps going: the worker sleeps at
  night and starts again in the morning. A Woodcutter cuts trees whose logs or stems connect to
  leaves, strips the leaves, and replants the same tree on the stump (four saplings on a 2 by 2).
  Planks, fences, chests and bare logs stay. Beehives stay, and it tells you. A Farmer hoes empty
  dirt, plants seeds you provide, harvests ripe crops and replants them, and uses bonemeal you
  give it one stage at a time. Nether wart also needs soul sand from you. It does not place water
  and it does not cook. Both need a deposit chest; the home chest restocks tools, saplings and
  seeds. They walk around crops when another way is open. The Farmer also lays a water
  channel every 9 blocks along the long side of the field, from water buckets you provide,
  and picks pumpkins, melons, cocoa, sweet berries, sugar cane, cactus, and bamboo the way
  those plants grow (stems and berry bushes stay, cane and cactus and bamboo keep their base).
- **Sieve and Sifter.** Craft a sieve from eight iron bars around a stick. Set a chest on top
  (gravel, sand, dirt, or soul sand) and a chest underneath. Use it by hand for one piece, or
  power it with redstone and it keeps sifting whenever more input arrives. Most pieces yield
  nothing; gravel sometimes gives flint, and a gem is rare. Soul sand only sifts if you supply
  it. Ore in the input chest is left alone. A sieve in the barrel builds a Sifter, which counts
  toward your worker limit and can mind one sieve during the day.
- **Miner prospecting.** A Miner hunts any valuables in the overworld, either in the ground around its home or from a start you mark with the Survey Stake. One entrance and one shaft, with a branch level at the best depth for each ore the shaft can reach (from a start near Y 64: copper at Y 48, iron at Y 16, lapis at Y 0, gold at Y -16, diamonds and redstone together at Y -59). A quota uses only that ore's level. The levels are saved on the mine. The bed and the ground within 8 blocks of the home stay undug. Each level is a 2-wide trunk with branches and 2 solid blocks between them. It lights the tunnels and puts everything it keeps in a chest at the entrance. Optional: stop after a number of one ore, and type a mine name (otherwise the sign reads like "Digby's Diamond Mine No. 1"). The entrance is wood from the home or deposit chest (8 planks; a log counts as 4) plus that chest. Missing wood or a missing chest skips the woodwork, and it uses a chest you placed. It stops at night, when it runs out of pickaxes, when the quota is met, or when the claim is mined out. With a crafting table by the bed and materials in the home chest, it makes a replacement pickaxe no better than the one it lost. The entrance chest is an ordinary drop-off (a Hauler can collect it; a Sifter can read gravel, sand, dirt and ores from it).

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
  Stake), most first; tap an item to see which chests hold it. It updates as soon as a worker
  puts something in or takes something out, including food, torches and tools taken from the home
  chest in the morning. Chests far away show what they held when last loaded, and how long ago.
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
- **The Hauler.** Build one from a barrel holding a bundle and leather boots (no tools) with a
  carved pumpkin on top: a worker in a leather cap with a backpack that carries, never digs. Mark
  your settlement's **depot** with the Survey Stake (tap the ground, Make a depot here, size,
  outline, confirm). Three times a day (morning, midday, evening) it walks the same loop of your
  Diggers' and Miners' drop-off chests and any chest you mark as a **Hauler pickup**, carries up to
  18 stacks at a time, and sorts everything into chests it sets up in the depot: one kind per chest,
  grouped by type, with walkways between the rows (16 chests for the default size, more for a
  bigger area; a depot is at most 16 by 16 blocks). A drop-off chest that's about 3/4 full calls it for an extra trip. Between rounds
  it tidies the depot. It takes chests from settlement storage or from you (tap it holding chests),
  says "I need chests for the depot" when it has none and "The depot is full" when there's no room
  left. It never takes goods from home chests or puts anything in them, and it still restocks its
  own food from its own home chest. Depot chests face the walkway, so a pair of the same kind joins
  into one double chest and the row behind faces the other way. It sleeps, tires from walking, finishes a delivery before
  bed, and needs a free work area (ticking area) for a round, waiting for one if all are taken. Its
  menu: Do a round now, Come here, Stop, Continue, Drop off, Go home, Pickup points. The new
  `/crew:haul` command (the `haul` order) moves things from one chest to another, and `/crew:round`
  sends it on a round now.

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
