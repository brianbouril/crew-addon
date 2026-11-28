# Crew Workers: player guide

Little workers that dig for you on this server. The same guide is in game: type `/crew:guide`,
or pick "How workers work" in any worker's menu.

1. [Build a worker](#build-a-worker)
2. [Talk to your worker](#talk-to-your-worker)
3. [The Survey Stake (your remote)](#the-survey-stake-your-remote)
4. [Quarry](#quarry)
5. [Forests and fields](#forests-and-fields)
6. [Miners (coming next)](#miners-coming-next)
7. [Tools and tough blocks](#tools-and-tough-blocks)
8. [Torches](#torches)
9. [Getting your stuff](#getting-your-stuff)
10. [Home, sleep and energy](#home-sleep-and-energy)
11. [Your settlement](#your-settlement)
12. [Haulers](#haulers)
13. [Stop and continue](#stop-and-continue)
14. [Sharing and good manners](#sharing-and-good-manners)
15. [Commands](#commands)
16. [Tips](#tips)

## Build a worker

1. Place a **barrel** and put **1 to 5 tools** in it (pickaxes, shovels, axes or hoes).
2. Add **torches** too if you want it to light its quarry stairs.
3. Place a **carved pumpkin** on top of the barrel.

The barrel and pumpkin turn into a little worker in a hard hat. It's yours: you're its owner.

The **first tool you put in the barrel decides its job**:
- a **shovel** makes a **Digger**: it digs quarries. Give it pickaxes too, for stone.
- a **pickaxe** makes a **Miner**: it will prospect for ore in the next version (no dig jobs until then).
- an **axe** makes a **Woodcutter**: it keeps a forest (see Forests and fields).
- a **hoe** makes a **Farmer**: it keeps a field (see Forests and fields).
No tools at all, but a **bundle** and **leather boots**? That makes a **Hauler**: it carries, it doesn't dig (see Haulers).
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
2. Pick **Plan a quarry**, **Plan a forest** or **Plan a field** and set the size with the sliders. **Clear above** also takes off the hill or trees on top of a quarry.
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

## Forests and fields

Stake the ground once, the way you stake a quarry: **Plan a forest** for a Woodcutter, **Plan a field** for a Farmer. Set the width and length (up to 64 by 64), check the outline, confirm, and start it with the linked worker. **/crew:forest** and **/crew:field** start the same job. It keeps working that plot: it sleeps at night and goes back in the morning.

**Woodcutter.** It cuts a tree only when the logs or stems are connected to leaves (nether stems, to wart blocks). Planks, fences, chests and a bare log wall stay put. It strips the leaves and picks up the apples, sticks and saplings, then plants the same tree on the stump. Saplings come from the cut first, then its home chest, then the deposit. A 2 by 2 tree needs four. If it hasn't enough it leaves the stump and tells you. A beehive is left where it is, and it tells you where.

**Farmer.** It hoes empty dirt, plants what you give it, picks a crop when it's ready, and plants the same one again. One piece of bonemeal you give it grows a crop one stage. It lays a **water channel every 9 blocks** along the long side of the field, from water buckets in its home chest or the deposit. The empty bucket goes back to the deposit. No bucket: it tells you and skips the channel. It does not take water out of the world.

Pumpkin and melon stems stay put and it picks the fruit. Cocoa goes on jungle logs you give it. It picks sweet berries without breaking the bush. Sugar cane, cactus, and bamboo keep their bottom block. Cane and cactus need sand from you, cane wants that sand beside the water, and cactus needs empty space on every side. Nether wart needs soul sand from you. It will not dig any of that ground up, and it does not cook.

Both need a **deposit chest**, like a quarry. The home chest is where they restock tools, saplings and seeds. They keep everything they pick up. They walk around crops when there's a way around.

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
- **Workers**: all your settlement's workers, what each is doing and where. **Out of tools** (red) and **Tools low** (yellow) show who needs tools. Far-away workers show **Working far away** or **Paused: nobody nearby**. Tap one for its menu; orders to a far-away worker wait until its area loads. A worker that was killed can be taken off the list with **Forget this worker** (if it was only far away, it comes back when its area loads).
- **Storage**: everything in the settlement's chests, added up (most first). Tap an item to see which chests hold it. Storage chests are your workers' home chests and drop-offs, your named places, and any chest you tap with the Survey Stake and pick **Add to settlement storage**. The total changes as soon as a worker puts something in or takes something out, including food, torches and tools it takes from its home chest in the morning. Chests far away show what they held when they were last loaded, marked with how long ago.
- **Give orders to everyone**: Stop, Continue, Drop off, Go home or Come to the bell, for every worker or just one kind (All Diggers). Far-away workers do it when their area loads.
- **Members**: add friends. Everyone in a settlement runs it together: their workers become the settlement's, and they can give orders to every worker, add and remove members, rename it and move its bell. The **founder** (who rang it first) can't be removed and can hand that role to someone else; the founder leaves only after doing that.
- **Name** and **Move the bell**. The bell can't be broken, by you or anyone, and explosions skip it: Move the bell puts it in your inventory, then place it and crouch-tap it again.

A plain tap still rings the bell. Village bells aren't yours to claim (for now).

Workers belong to the settlement (on paper, to its founder), so someone who leaves takes none with them. A settlement can have **6 workers for each person in it**; on your own you can have 6. A server operator can change the 6 to keep the server running smoothly.

## Haulers

**Build one:** a barrel holding a **bundle** and **leather boots** (no tools), carved pumpkin on top. It wears a leather cap and a backpack. It never digs.

**Mark a depot** first: tap the ground with the Survey Stake, pick **Make a depot here**, set the width and length, check the outline, then tap again and confirm. It needs a flat floor with 2 blocks of room. One per settlement, up to 16 by 16; 5 by 7 holds 16 chests, a bigger area more.

**Three rounds a day** (morning, midday and evening) it walks the same loop of chests, nearest first: your settlement's Diggers' and Miners' drop-off chests, plus any chest you tap with the stake while it's linked (**Hauler pickup**). It carries 18 stacks at a time and brings everything back to the depot. A drop-off chest that gets about 3/4 full calls it for an extra trip. It never takes goods from home chests or puts anything in them. It still takes its own food from its own home chest in the morning, like the other workers.

**In the depot** it sets up chests in rows with walkways and sorts as it stores: one kind of item per chest, grouped (stone and dirt, ores and metals, wood, food, other). Between rounds it tidies: it merges half stacks and moves strays (never shulker boxes, named items or tools).

**Chests:** it takes them from your settlement's storage chests, or tap it holding chests. It never crafts them. With none it says **I need chests for the depot**. When every chest is full it keeps what it carries, waits at the depot and says **The depot is full** once, then carries on when there's room.

Its menu: **Do a round now**, Come here, Stop, Continue, Drop off (at the depot), Go home, and its **Pickup points**. It sleeps at night and tires from walking (more when loaded); carrying at dusk, it delivers first.

**/crew:haul <worker> <from> <to> [items]** moves things from one chest to another (places by name or as "x y z"; items comma separated). **/crew:round <worker>** does a round now.

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
- **/crew:continue <worker>**: pick its dig, forest, field, or a Hauler's round back up
- **/crew:forest <worker> <from> <to> [deposit]**: a Woodcutter keeps that forest
- **/crew:field <worker> <from> <to> [deposit]**: a Farmer keeps that field
- **/crew:round <worker>**: a Hauler does a round now
- **/crew:haul <worker> <from> <to> [items]**: a Hauler moves things from one chest to another
- **/crew:allow <worker> <player>**: let a friend give orders
- **/crew:setplace "name"**: save the chest you're looking at as a named drop-off (add **true** to share it with everyone)
- **/crew:places**: list saved places
- **/crew:jobs**: every job and its options
- **/crew:cap [number]**: (operators) the worker limit, per person in a settlement and on your own

## Tips

- Workers keep working when you walk away (up to 10 working at once far from everyone).
- It digs as fast as you would with the same tool. Better tools (and Efficiency) make it faster.
- If it can't find a way somewhere, it takes a shortcut once and tells you.
- It opens wooden doors and fence gates as it walks and shuts them behind it (iron doors only if they're already open).
- It never breaks doors, gates, trapdoors, chests with items in them, spawners or bedrock, and it leaves water and lava alone. It tells you about lava, spawners and diamonds it finds.
- Its menu status shows the job, how far along it is, its energy, its home, and any blocks it had to leave.
