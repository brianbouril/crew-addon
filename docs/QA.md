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

Built Nov 14 2026 and mock-tested. The server already runs the scripts for doors, Clear above,
fetching tools (4, 4b) and restarting (6), copied there Nov 14 under 0.4.0. The rest (5, 7, 8, 9)
is only in the local world.

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

**Tools**
- [ ] 4. Let its last pickaxe break. It drops off what it dug, stands **beside** the chest (not on
      it), and asks for a pickaxe. Put one in that chest: it takes it and goes back to work.
- [ ] 4b. Same, but put the pickaxe in its home chest instead: it walks home, takes it, goes back.
- [ ] 5. Tools menu, "Use the fastest tool": with a stone and a diamond pickaxe, it uses the
      diamond one on stone. Switch back to "Save my best tools": it uses the stone one again. The
      status line says which setting it's on.

**Restarting a quarry**
- [ ] 6. Stop a half-dug quarry, then Continue: it walks straight to the first block still there,
      without retracing every dug-out spot.

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
- [ ] 10. `/halt <worker>`, `/workers`, `/guide` and `/setplace "name"` work (short and with
      `crew:`). The server log has no "Custom Command alias ... already in use" warnings.

---

## Every release (regression)

Quick pass before any server install. Takes about 15 minutes in the local world.

- [ ] Build a worker (barrel, tools, carved pumpkin): it appears with the right skin and name tag.
- [ ] Tap with a tool: it takes it. Tap with torches: it takes them. A stranger can't give it either.
- [ ] Crouch-tap: menu opens. A player who isn't allowed sees status only.
- [ ] Survey Stake: link a worker, plan a quarry, confirm, start it. Plan a branch mine the same way.
- [ ] Quarry digs block by block at player speed, leaves a working stair, places torches on it.
- [ ] Branch mine: stairs, trunk, branches with 2 solid blocks between; ore in the walls dug and
      filled; obsidian with an iron pickaxe skipped and logged.
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

- (none open)

---

## Shipped

### 0.4.0 (Nov 14 2026)
Tested in the local world Nov 12 to 14: building, stake plan and confirm, crouch menu, quarry and
branch mine digging, obsidian skipped, resume after reopening the world, stake remote,
keep-everything and drop-off messages, night/dawn routine, sleep pose in bed and rough sleep, tool
in hand, block-by-block digging at player speed, food. Installed on the server Nov 14 (first BDS
install).
