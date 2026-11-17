# Crew Workers: player guide

Little workers that dig for you on this server. The same guide is in game: type `/crew:guide`,
or pick "How workers work" in any worker's menu.

1. [Build a worker](#build-a-worker)
2. [Talk to your worker](#talk-to-your-worker)
3. [The Survey Stake (your remote)](#the-survey-stake-your-remote)
4. [Quarry](#quarry)
5. [Miners (coming next)](#miners-coming-next)
6. [Tools and tough blocks](#tools-and-tough-blocks)
7. [Torches](#torches)
8. [Getting your stuff](#getting-your-stuff)
9. [Home, sleep and energy](#home-sleep-and-energy)
10. [Your settlement](#your-settlement)
11. [Stop and continue](#stop-and-continue)
12. [Sharing and good manners](#sharing-and-good-manners)
13. [Commands](#commands)
14. [Tips](#tips)

## Build a worker

1. Place a **barrel** and put **1 to 5 tools** in it (pickaxes, shovels, axes or hoes).
2. Add **torches** too if you want it to light its quarry stairs.
3. Place a **carved pumpkin** on top of the barrel.

The barrel and pumpkin turn into a little worker in a hard hat. It's yours: you're its owner.

The **first tool you put in the barrel decides its job**:
- a **shovel** makes a **Digger**: it digs quarries. Give it pickaxes too, for stone.
- a **pickaxe** makes a **Miner**: it will prospect for ore in the next version (no dig jobs until then).
- axes and hoes are for jobs coming later.
Each worker only takes its own jobs. Workers from before this update are Diggers now.

Better tools let it mine more and dig faster, just like yours.

Its name tag shows its name, its job and its best tool.

## Talk to your worker

- **Crouch and tap it** to open its menu (whatever you're holding).
- **Tap it holding a tool** to give it that tool (5 at most).
- **Tap it holding torches** to give it torches.
- **Tap it holding the Survey Stake** to link the stake to it, so you can give it orders from anywhere.

The menu has its jobs (a Digger's: Quarry), Come here, Stop, Continue, Drop off, Take what it carries, Home (its bed and chest), and Tools (see how worn each tool is).

Owners also get: Name, Role, Who can give orders, and Dismiss.

If it isn't yours and you haven't been allowed, you'll only see what it's doing.

## The Survey Stake (your remote)

Get one: pick **Get a Survey Stake** in a worker's menu, type **/crew:stake**, or craft one (string on top of two sticks).

**Link a worker:** tap one of your workers with the stake. From then on the stake works for that worker, from any distance:
- **Tap a bed**: make it the worker's home.
- **Tap a chest**: its home chest, the drop-off for digs you plan, or a named place.
- **Tap the air**: the worker's orders, your dig plan, or link another worker.

Plan a dig
1. **Face the way you want to dig** and tap the ground block where it should start.
2. Pick **Plan a quarry** and set the size with the sliders. **Clear above** also takes off the hill or trees on top of it.
3. A **white outline** shows the plan while you hold the stake (flames point forward).
4. Tap with the stake again (any block, or the air) and pick **Confirm**. The outline turns green.
5. **Start it with** the linked Digger right there, or later from its orders. Choose where it drops off and what to bring back, then Start.

Done with the stake? Every stake menu has **Put the stake away**. Your plan and link are kept.

A worker far from everyone may be out of reach (its area isn't loaded). Go a bit closer.

## Quarry

A **Digger's** job. Digs out a whole box, top layer first, row by row. The block you staked is the top corner: it digs forward (the way you faced), to your right, and down.

**Depth** is how many blocks down, not a Y level, so it never needs a minus sign: from Y 64, a depth of 20 digs down to Y 45. The plan's summary says where the bottom ends up.

It leaves a **staircase in the wall** spiralling down, so you and the worker can walk in and out.

**Clear above** (on unless you switch it off): before digging, it clears everything over the box up to open sky, top down, so no hill, tree or overhang is left floating. The outline shows how high that goes. It won't do this for a quarry staked underground (more than 48 blocks overhead).

Otherwise it only digs inside the box. The one exception: if a block is in its way at head height just above the box, it clears it.

Up to 128 blocks on each side.

## Miners (coming next)

A worker built with a **pickaxe** first is a **Miner**. In the next version you'll tell a Miner what ore to find and roughly where, and it digs its own **branch mine**: stairs down to the best depth for that ore, a main tunnel and side branches with 2 solid blocks between them.

It will mine **ore it finds in the tunnel walls** and fill the holes back in, light its tunnels, and report what it finds.

Until then a Miner has no dig jobs. Branch mines can't be ordered on their own any more; one a worker had already started can still be continued.

## Tools and tough blocks

It mines like you do: **one block at a time**, with the right tool, and **takes as long as you would** with that tool (stone with an iron pickaxe: under half a second; obsidian with diamond: about 9 seconds). It uses a shovel on dirt and gravel and a pickaxe on stone. It uses the weakest pickaxe that works, so your best one is saved for ore. Rather it used its best tool for everything (faster, but it wears out)? Pick **Use the fastest tool** in its Tools menu.

Same rules as you: a stone pickaxe for iron, iron for diamonds, diamond for obsidian.

Tools wear out. It **warns you at 10%** and switches tools when one breaks. Out of pickaxes? It takes what it dug to its drop-off chest and waits there. **Put a new one in that chest or its home chest** (it fetches it), or tap it holding one, and it goes back to work.

If none of its tools can break a block (obsidian with an iron pickaxe), it **leaves it and digs around it**. Nothing is wasted.

## Torches

Give it torches (in the barrel when you build it, or tap it holding torches) and it places them on the **quarry staircase** as it goes down, so the stairs stay lit.

Miners will light their tunnels too, close enough that monsters can't spawn, when prospecting arrives.

It tells you when it runs out. Torches never go into the chest.

## Getting your stuff

It carries what it digs and **drops it in your chest** when it's full and when it's done.

"Bring back" when you start a job: **Everything** (the default) keeps all it digs, like you would. **Valuables** keeps ores, gems and raw metals and throws away stone and dirt. **Nothing** just digs.

It carries 36 slots like you do (its tools take the first 5), and every drop-off message says which chest it used.

Any time, from its menu:
- **Take what it carries**: straight into your inventory.
- **Drop off at a chest**: it walks it all to a chest.

Its tools, torches and food always stay with it.

## Home, sleep and energy

Workers live by the day, like villagers. **Give yours a home**: with the Survey Stake linked to it, tap a bed (from any distance). Or stand next to a bed, crouch-tap the worker, pick **Home**, then **Make the bed next to me its home**. One worker per bed. The nearest chest or barrel (within 8 blocks) becomes its **home chest**; tap another chest with the stake to change it.

- **At dusk** it pauses its job, walks home, drops off what it dug in the home chest and goes to bed.
- **In the morning** it takes torches, food and spare tools from the home chest and goes back to its job where it left off.
- **A safe bed** has a roof over it and no monsters nearby. It sleeps badly in an unsafe one and tells you why.
- With no home it sleeps wherever it is, and rests less.
- **Asleep?** Crouch and tap it (or its bed) for its menu: it keeps sleeping. Pick **Wake up** to get it up, or just give it an order. At night it stays up while it has something to do, then goes back to bed.

**Energy:** digging tires it out. A tired worker digs slower; a worn-out one stops for a rest. Sleep gets its energy back. **Food** does too (bread, cooked meat or fish, baked potatoes and more): put some in its home chest, or give it some when you build it, and it eats when it's tired. Food is never required.

Tip: put a bed and a chest near a mine so its walk home is short.

## Your settlement

**Found one:** place a **bell** yourself, then **crouch and tap it** (empty hand, or holding anything that isn't a block). Name it, and every worker you've built (and every one you build later) belongs to it, wherever it is.

Crouch-tap the bell any time for the settlement menu:
- **Workers**: all your settlement's workers, what each is doing and where. **Out of tools** (red) and **Tools low** (yellow) show who needs tools. Far-away workers show **Working far away** or **Paused: nobody nearby**. Tap one for its menu; orders to a far-away worker wait until its area loads.
- **Members**: add friends. Their workers join too, and every member can give orders to every worker in the settlement.
- **Name** and **Move the bell** (owner only). The bell can't be broken, by you or anyone, and explosions skip it: Move the bell puts it in your inventory, then place it and crouch-tap it again.

A plain tap still rings the bell. Village bells aren't yours to claim (for now).

Each player can have up to **6 workers** (a server operator can change this to keep the server running smoothly).

## Stop and continue

**Stop** asks: stop here, or stop and drop off what it carries.

Either way it **remembers where it was**. Pick **Continue** in its menu and it walks back and picks the job up where it left off. Sending it to drop off or calling it over works the same way.

Starting a new quarry forgets the old one.

It also carries on by itself after the server restarts, and after a night's sleep.

## Sharing and good manners

Only the **owner** and the players they allow can give a worker orders or tools. Owners add friends under **Who can give orders**. Everyone in your settlement can give orders to all its workers. Server operators can always help out.

**Workers dig whatever is inside the plan**, whoever built it, and with Clear above, everything over a quarry too. So stake your digs away from other people's builds, and check the outline (it shows the full height) before you confirm.

**Dismiss** (owners only) gives back its tools, what it carries, the barrel and the pumpkin.

## Commands

- **/crew:guide**: this guide
- **/crew:stake**: get a Survey Stake
- **/crew:menu <worker>**: open a worker's menu from anywhere
- **/crew:workers**: the workers you can give orders to
- **/crew:status <worker>**: what it's doing
- **/crew:come <worker>**: call it to you
- **/crew:halt <worker>**: stop it
- **/crew:continue <worker>**: pick its dig back up
- **/crew:allow <worker> <player>**: let a friend give orders
- **/crew:setplace "name"**: save the chest you're looking at as a named drop-off (add **true** to share it with everyone)
- **/crew:places**: list saved places
- **/crew:jobs**: every job and its options
- **/crew:cap [number]**: (operators) how many workers each player may have

## Tips

- Workers keep working when you walk away (up to 10 working at once far from everyone).
- It digs as fast as you would with the same tool. Better tools (and Efficiency) make it faster.
- If it can't find a way somewhere, it takes a shortcut once and tells you.
- It opens wooden doors and fence gates as it walks and shuts them behind it (iron doors only if they're already open).
- It never breaks doors, gates, trapdoors, chests with items in them, spawners or bedrock, and it leaves water and lava alone. It tells you about lava, spawners and diamonds it finds.
- Its menu status shows the job, how far along it is, its energy, its home, and any blocks it had to leave.
