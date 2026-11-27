# QA list

The in-game test list. A running list: every change a player can see adds a check under
"Next release" when it's built. A test pass ticks what worked, writes the date, and notes anything
that broke under "Found while testing". When a release ships, its section moves down under
"Shipped" as the record.

Test in the local "Addon Test" world first (`/reload` picks up script changes; model, texture or
`worker.json` changes need Minecraft fully restarted). The server only gets a release after Brian
OKs it.

**While testing, watch for these log lines** (local: `%APPDATA%\Minecraft Bedrock\logs\ContentLog*.txt`;
server, which runs as SYSTEM: `C:\Windows\System32\config\systemprofile\AppData\Roaming\Minecraft Bedrock Server\logs\ContentLog*.txt`, admin to read):
- `[Crew] v<version> loaded`: the right version is running.
- `[Crew-Inside]`: a worker was inside a block (where, which block, what it was doing).
- `[Crew-NoSight]`: it had to dig a block it couldn't see.
- `[Crew-Blink]`: it found no way to walk and took a shortcut.
- Any script error.

---

## Next release (0.4.1, unreleased)

**Woodcutter and Farmer** (feat/woodcutter-farmer)
- [ ] W1. Barrel with an axe, carved pumpkin: a Woodcutter. A hoe makes a Farmer. The Woodcutter's
      menu offers Forest, not Quarry. A Digger refuses Plan a forest.
- [ ] W2. Stake: Plan a forest, sliders, outline up to 48 blocks tall, confirm, start with the
      linked Woodcutter. A 65 by 65 plan is refused. `/crew:forest` starts the same job.
- [ ] W3. An oak with leaves is cut, the leaves go, a sapling is planted on the stump. A log wall
      with no leaves, a plank house, and a chest stay. A bee nest stays and the worker says where
      it is. A 2 by 2 dark oak gets four saplings.
- [ ] W4. Take its saplings away and empty the chests: it cuts the tree, tells you it couldn't
      replant, and leaves the stump bare.
- [ ] W5. Stake a field. Dirt becomes farmland and your seeds are planted. Ripe wheat is picked
      into the deposit chest and replanted. One bonemeal grows a crop one stage. Nether wart on
      dirt waits until you give it soul sand. It does not cook.
- [ ] W5b. Give it water buckets. A water row appears every 9 blocks along the long side of the
      field (through the middle of each band). The empty buckets go to the deposit. With no
      bucket it says so and does not take water from a lake.
- [ ] W5c. Pumpkin and melon: the stem stays, the fruit is picked. Cocoa on a jungle log you
      gave it is picked and replanted. Sweet berries are picked and the bush stays. Sugar cane,
      cactus, and bamboo keep the bottom block. Cane and cactus are not planted without sand
      from you. Cactus is not planted against another block.
- [ ] W6. At dusk it goes to bed; at dawn it is back on the same forest or field. Stop, then
      Continue, picks the plot back up. It walks around the crops when there's a path around them.
- [ ] W7. No new script errors over a 30 minute run. Brian: does the replanting look right, and
      did the Farmer leave your water where you put it?

**Settlements and the rest of 0.4.1**

Built Nov 14 2026 and mock-tested. Nov 15 (Brian's OK) the server got all of it, through the
Depth wording (3d), as scripts under 0.4.0 (backup in `C:\MinecraftServer-backups\`), so 5, 7, 8
and 9 go out to friends before their local test. Nov 15 9:12 PM (Brian's OK) it also got the
light-block and chest-in-sight fix by `reload` (backup
`C:\MinecraftServer-backups\2026-11-15_2112_before-lightblock-fix`). A script change to a slash command's options needs
a full server restart: `reload` refuses to re-register it.

**What's left, in three test runs** (Nov 15; on the server, which has every fix):
- **Run A, one daytime quarry (4, 4b, 9, 3c, 8):** with the worker's Quarry menu, check there's no
  Pace option (8). Stake a small quarry (about 6x6x6) with Clear above **off** (3c), near its home,
  with its home chest against the inside of a house wall. Give it only a nearly worn pickaxe and let
  it run out (4); it waits beside the drop-off chest, so leave that chest empty and put a pickaxe in
  the home chest (4b). Let it finish the quarry and check the log for `[Crew-Inside]` and
  `[Crew-Blink]` (9). Also type `/crew:mine` and check it has no Pace option (8).
- **Run B, doors and the deep refusal (2, 3b):** put an iron door on its way home, shut, then open
  (2). Stake a quarry with a door or trapdoor inside the box: it digs around it. Then stake a quarry
  far underground with Clear above on: it's refused (3b).
- **Run D, Diggers and Miners (11, 11b, 11c):** on the **staging server** (Nov 16: it runs the role
  split on a copy of the live world from the 5 AM backup; join 127.0.0.1 port 19134). Do it first:
  Run A needs a Digger. The live server gets the split only after Run D is clean and Brian OKs it.
- **Run C, at night (7, 7b, 7c):** crouch-tap the sleeping worker and its bed (7), Wake up and wait a
  minute (7b), wake it again and give it a small dig (7c).

**Settlements, release 1 (built Nov 17, mock-tested; staging first)**
- [ ] 12. Place a bell yourself, crouch-tap it with an empty hand: it doesn't ring, villagers nearby
      don't run inside, and a "Found a settlement here?" form opens with "<your name>'s Settlement".
      Found it: the message says how many of your workers joined. A plain tap still rings it.
- [ ] 12b. Crouch-tap a village's own bell: "This bell belongs to the village", no ring. Crouch with
      a block in hand against a bell: the block is placed as usual.
- [ ] 12c. Try to break the settlement bell, and the block under it, as the owner and as someone
      else: refused with "Move the bell from the settlement menu". Blow up TNT next to it: the bell
      and its block stay. Move the bell: it's in your inventory, the menu says the bell isn't up;
      place it elsewhere and crouch-tap: it's back with the same name and workers.
      Repeat with a bell hung on a wall: the wall block is protected, the blocks either side of
      the bell along the wall can still be broken. Same with a bell hanging under a block.
- [ ] 12d. Workers list on a phone-size screen: each worker shows name and role, then what it's
      doing and how far/which way. Take a Digger's last tool: it shows red "Out of tools". Walk far
      away from a working Digger (still loaded by its ticking area): "Working far away". A worker in
      an unloaded area shows "Paused: nobody nearby" (or "last seen N min ago" if it was idle); give
      it Stop from its far menu, walk back: it stops. Forget a far-away worker: it leaves the list;
      walk back to it: it's on the list again. Kill a worker (/kill): it leaves the list by itself.
      A worker that dropped off at a friend's named place outside the settlement: that chest isn't in Storage.
- [ ] 12e. Add a friend as a member: their workers appear in the list, they can open and order your
      workers, and you theirs. They can add and remove members, rename and move the bell, but
      can't remove you (the founder). Make them the founder (every worker's owner becomes them), then make yourself founder again.
      Remove them: their workers stay in the list, now yours, and their orders are refused.
- [ ] 12f. Worker limit: `/crew:cap` alone shows the limit and how to change it. Alone in your
      settlement, count your workers (`/crew:workers`), then as an operator set the limit to that
      count with `/crew:cap <count>` (e.g. `/crew:cap 3`). Building one more is refused with "<settlement> has N workers, its limit is N" and
      the barrel keeps its tools. Add a member: the limit doubles and their build belongs to you.
      Set it back to 6 (`/crew:cap 6`), then build: it works. A non-operator can't run `/crew:cap 6`.
- [ ] 12g. Existing workers on the live-world copy (staging) all show up after founding, with their
      jobs, homes and tools unchanged.

**Settlements, release 2 (built Nov 18, mock-tested; staging first)**
- [ ] 13. Storage: put things in a worker's home chest and a named place, and tap a third chest with
      the Survey Stake, Add to settlement storage. The settlement menu's Storage adds all three up,
      most first; tap an item for which chests hold it. A double chest counts once. Two double chests side
      by side, both full of cobblestone and both added: both count (and nothing in them changes). Take a stack out
      and reopen Storage a few seconds later: the total dropped.
- [ ] 13b. Walk far from one storage chest (out of loaded range): Storage says it's far away and
      shows its last count; come back and it updates. A worker's drop-off shows up straight away.
- [ ] 13c. Give orders to everyone: Come to the bell (everyone walks to the bell), All Diggers > Stop
      (only Diggers stop), Go home (workers with a bed walk home, the rest stay), Drop off, and
      Continue after a Stop (paused digs pick up). A worker far away does it when you come near.

**Diggers and Miners (built Nov 15, mock-tested; not on the server yet)**
- [ ] 11. Existing workers turn into Diggers the first time they load: the name tag says Digger, the
      skin changes, and the owner gets one "I'm a Digger now" message. A quarry it was digging (or
      had stopped) carries on / continues.
- [ ] 11b. Build a new worker with a shovel first (and a pickaxe): it's a Digger and digs a quarry,
      stone included. Build one with a pickaxe first: it's a Miner, its menu has no Quarry, and
      `/crew:minebox` or the stake's "Start it with" refuses with "Quarries are a Digger's job".
- [ ] 11c. Branch mine is gone: no button in the worker menu, the stake only plans quarries,
      `/crew:jobs` doesn't list it.

**Doors**
- [x] 1. A worker walking to a bed inside a house opens the wooden door, walks through and shuts it
      behind it. Same for a fence gate. (Brian, Nov 14)
- [ ] 2. An iron door: it only walks through if the door is already open. It never breaks a door,
      gate or trapdoor in a quarry or branch mine.

**Quarry: Clear above**
- [x] 3. Stake a quarry under a hill or tree with Clear above on. The outline shows the full height,
      the worker clears it top down and no floating blocks are left. (Brian, Nov 14: good paths up)
- [ ] 3b. Stake one deep underground (over 48 blocks of rock overhead): it's refused with a message.
- [ ] 3c. Switch Clear above off in the size menu: it digs only the box.
- [x] 3d. Quarry size menu (stake and the worker's Quarry menu): the Depth slider says "how many
      blocks down" with the top layer's Y; the plan summary says "down to Y ..." and the outline's
      bottom is at that Y. (A friend on Xbox read Depth as a Y level and looked for a minus sign.)

**Tools**
- [ ] 4. Let its last pickaxe break. It drops off what it dug, stands **beside** the chest (not on
      it), and asks for a pickaxe. Put one in that chest: it takes it and goes back to work.
- [ ] 4b. Same, but put the pickaxe in its home chest instead: it walks home, takes it, goes back.
- [x] 5. Tools menu, "Use the fastest tool": with a stone and a diamond pickaxe, it uses the
      diamond one on stone. Switch back to "Save my best tools": it uses the stone one again. The
      status line says which setting it's on. (Brian, Nov 15, on the server)

**Restarting a quarry**
- [x] 6. Stop a half-dug quarry, then Continue: it walks straight to the first block still there,
      without retracing every dug-out spot. (Brian, Nov 15, on the server)

**Sleeping worker**
- [ ] 7. At night, crouch-tap a sleeping worker: its menu opens and it stays asleep. Crouch-tap its
      bed: same. The menu shows **Wake up** instead of Stop.
- [ ] 7b. Wake up: it gets up beside the bed (not on it) and says its energy. About a minute later,
      with nothing to do, it goes back to bed.
- [ ] 7c. Wake it and give it a dig: it works through the night, then sleeps when the dig is done.

**Fast pace removed**
- [ ] 8. No Pace option in the dig menus or in `/crew:mine` and `/crew:minebox`. An old job saved
      with Fast continues at normal speed.

**Line of sight**
- [ ] 9. Quarry next to the stair: it never digs through a stair step to reach a block behind it;
      it walks round to where it can see the block. No `[Crew-Inside]` lines in the log after a
      full quarry. (The stair pass-through Brian saw Nov 14 couldn't be reproduced in the mock.)

**Renamed commands**
- [x] 10. `/halt <worker>`, `/workers`, `/guide` and `/setplace "name"` work (short and with
      `crew:`). The server log has no "Custom Command alias ... already in use" warnings.
      (On the server since Nov 15, applied to its 0.4.0 scripts only; no warnings at load. Brian, Nov 15: all four work.)

---

## Every release (regression)

Quick pass before any server install. Takes about 15 minutes in the local world.

- [ ] Build a worker (barrel, tools, carved pumpkin): it appears with the right skin and name tag;
      shovel first = Digger, pickaxe first = Miner.
- [ ] Tap with a tool: it takes it. Tap with torches: it takes them. A stranger can't give it either.
- [ ] Crouch-tap: menu opens. A player who isn't allowed sees status only.
- [ ] Survey Stake: link a Digger, plan a quarry, confirm, start it.
- [ ] Quarry digs block by block at player speed, leaves a working stair, places torches on it;
      obsidian with an iron pickaxe skipped and logged.
- [ ] A Miner refuses a quarry with a message naming the Digger. (From v0.6: the Miner's
      prospecting replaces the old branch-mine check: stairs, trunk, branches with 2 solid blocks
      between, ore in the walls dug and filled.)
- [ ] Stop, then Continue: picks up where it left off.
- [ ] Drop off at a chest; Take what it carries.
- [ ] Home: set a bed and chest. At dusk it goes home, unloads, sleeps; at dawn it restocks and
      goes back to its dig.
- [ ] Leave the world and come back (or restart the server): it carries on.
- [ ] `/crew:guide` opens the guide and its pages match what the worker does.
- [ ] Log shows `[Crew] v<new version> loaded` and no script errors.

## Server install checks (after Brian's OK)

- [ ] Server stopped, whole server folder backed up.
- [ ] Both packs replaced, both world pack lists show the new version.
- [ ] Server started; its log shows `[Crew] v<version> loaded`.
- [ ] A friend joining gets the new resource pack (the new skin or text shows).
- [ ] Existing workers on the server still have their jobs, homes and tools.

---

## Found while testing

Write what went wrong here during a pass; it moves to `docs/PLAN.md` "Next fixes" once it's a task.

- Nov 15 (check 4, server): when its last pickaxe broke in the quarry it teleported to the chest
  (`[Crew-Blink]` to 12 blocks over the chest). Cause: a dynamic-light add-on on the server places
  `light_block_15` around the worker and it treated them as walls (the two `[Crew-Inside]` lines in
  that quarry were light blocks too). Fixed: walked through like air. Re-test 4.
- Nov 15 (check 4b, server): it walked to its home chest but stopped outside the house, a block from
  the chest through the wall. Fixed: it must see the chest from where it stops. Re-test 4b.
- Nov 15: a door that was already open stays open after a worker walks through (it only closes
  doors it opened). Now a task in `docs/PLAN.md` "Next fixes".

---

## Shipped

### 0.4.0 (Nov 14 2026)
Tested in the local world Nov 12 to 14: building, stake plan and confirm, crouch menu, quarry and
branch mine digging, obsidian skipped, resume after reopening the world, stake remote,
keep-everything and drop-off messages, night/dawn routine, sleep pose in bed and rough sleep, tool
in hand, block-by-block digging at player speed, food. Installed on the server Nov 14 (first BDS
install).
