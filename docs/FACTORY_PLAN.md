# Crew Software Factory Plan

Nov 16, 2026 · Brian

## Bottom line

Yes, a factory is the right idea, but only if it is built around testing. Claude can already write a feature in an evening. What it cannot do yet is prove the feature works in real Minecraft, and nothing past v0.2 has been run there.

- **The real bottleneck:** every feature waits on you to load a world, spawn workers and watch them. That is one person, a few hours a week, with a week off coming up.
- **The thesis:** move as much checking as possible off you and onto machines. Mock tests catch logic bugs in seconds. GameTests on a headless staging server catch engine bugs in minutes. Your playtest is saved for feel, balance and fun.
- **What a factory adds:** parallel Claude sessions on separate features, each with a written spec and done criteria, a reviewer pass before merge, and one weekly integration build you play.
- **What it does not fix:** unclear design. Specs have to be decided before sessions start, or parallel sessions just produce parallel rework.
- **Honest V1 target:** five features (settlement layer, Hauler, Woodcutter and Farmer, Miner prospecting, Sifter) shipped to your friends' server by Dec 31. The Smith, Builder and the LLM layer move to January. Even five is tight with a week out; the schedule below shows where it can slip.

## What is verified and what is not

The plan rests on a few things nobody has checked yet, so week 1 checks them before any feature work.

| Claim | Status | How we find out |
| --- | --- | --- |
| Quarry, branch mine, tool kit and permissions work in the mock sim | Verified (Nov 13, Node tests pass) | Already done |
| v0.2 and later work in real Minecraft | Not verified on the server | Your QA Run D on staging |
| Digger/Miner split works | Committed, tested in your Addon Test world only | QA on staging, then live |
| GameTest can run Crew scenarios on a dedicated server | Plausible, not confirmed | Week 1 spike |
| Tests can run with nobody logged in | Unknown; no page I read says either way | Week 1 spike |
| 15 to 25 workers per server before lag | An estimate, not measured | Load test in week 3 |
| Two parallel Claude sessions stay within your usage limits | Not checked | Watch usage in week 1 |

What the docs do say about GameTest, read Nov 16: the module is still pre-release and can change between versions ([Microsoft Learn module page](https://learn.microsoft.com/minecraft/creator/scriptapi/mojang-gametest/mojang-gametest)), and a world needs the Beta APIs experiment and cheats turned on to run it ([Microsoft Learn getting started](https://learn.microsoft.com/en-us/minecraft/creator/documents/gametestgettingstarted), dated 2024). Mojang has said it runs GameTest on dedicated servers in its own CI ([Bedrock Wiki Q&A](https://wiki.bedrock.dev/meta/gametest-qna), 2021). That is promising but old, and it is not a setup they publish.

## Setting up the factory in Claude Code

The factory is four roles run by Claude sessions, plus you as product owner. Keep it to two builder sessions at once; a third mostly adds merge conflicts and usage.

| Role | What it does | How to run it |
| --- | --- | --- |
| Lead (your current session) | Writes specs, keeps the roadmap, merges, builds the weekly release | Your existing "Project review and clarification" session, on `main` |
| Builder A and B | Each builds one spec on its own branch | `claude --worktree <feature>` in a second terminal |
| Reviewer | Reads a branch's diff against its spec before merge | A subagent in `.claude/agents/reviewer.md`, read-only tools |
| Test writer | Writes mock tests and scenario tests from the spec's done criteria, before code | A subagent in `.claude/agents/test-writer.md` |

### Step by step

1. **Put the repo under git with a remote.** If it is only local, create a private GitHub repo and push. Worktrees work locally too, but a remote is your backup and history.
2. **Rewrite CLAUDE.md as the factory's rulebook.** Keep the decisions table. Add: the test commands, the branch rules below, "never change pack UUIDs or the `crew:` namespace", "every new Script API call gets a mock in `tools/sim/mock`", "update CHANGELOG and QA.md in the same branch".
3. **Add `specs/` with one file per feature**, using the template below. A builder session is started with one spec and nothing else.
4. **Create the two subagents** in `.claude/agents/`: `reviewer.md` (tools: Read, Grep, Glob, Bash for running tests only; checks the diff against every done criterion and lists gaps) and `test-writer.md`.
5. **Add hooks in `.claude/settings.json`.** A `PostToolUse` hook on `Edit|Write` that runs the mock tests and reports failures back. A `Stop` hook that blocks ending a session while tests fail (the docs say Claude Code overrides a Stop hook after eight blocks in a row, so it cannot loop forever).
6. **Adopt the branch flow:** `main` is always playable. Each feature is `feat/<name>` in its own worktree. Merge only after mock tests pass, the reviewer subagent signs off and the scenario tests pass on staging. One release branch a week, tagged `v0.x.y`.
7. **Make the build reproducible:** one command (`python3 tools/build.py`) builds the .mcaddon and bumps nothing by hand. Add a version-bump script so both manifests and `util.js` move together.

Worktree details from the [Claude Code worktrees docs](https://code.claude.com/docs/en/worktrees): `claude --worktree <name>` (or `-w`) creates `.claude/worktrees/<name>/` on a new branch, and resuming is `claude --worktree <name> --resume`. Subagent and hook formats are on the [subagents](https://code.claude.com/docs/en/sub-agents) and [hooks](https://code.claude.com/docs/en/hooks-guide) pages.

### Spec template

```markdown
# Spec: <feature> (v0.x)
Owner: Brian  Status: draft | ready | building | in review | shipped

## Player story
One or two sentences in the player's words.

## Decisions (from Brian)
- Each decision, dated. Nothing here is the builder's guess.

## Out of scope
- What this feature does not do yet.

## Done criteria
1. Mock test: <named scenario> passes.
2. Scenario test on staging: <setup> -> <expected blocks/items/entities> within N ticks.
3. Playtest check for Brian: <one thing to look at and feel>.
4. No new script errors in the server log over a 30 minute run.

## Touches
Files and data it changes (dynamic properties, entity JSON, lang).

## Open questions
Anything the builder must ask before starting.
```

The spec is the leverage point. Your design-system instinct applies here: a builder session with a vague spec makes confident wrong choices fast.

## Automated testing

Three layers, each catching what the one above it misses. The goal is that a build reaches you only after layers 1 and 2 pass.

| Layer | Catches | Runs where | Speed | Who writes it |
| --- | --- | --- | --- | --- |
| 1. Mock sim (existing `tools/sim`) | Logic: plans, tool choice, permissions, ledger math, sifter odds | Node, on every edit via the hook | Seconds | Test-writer subagent |
| 2. Scenario tests on staging | Engine behavior: real blocks, entities, pathing, chests, ticking areas, script errors | A second, private dedicated server | Minutes | Test-writer subagent |
| 3. Your playtest | Feel, balance, fun, confusing menus | Staging, then live | An hour a week | You |

### Layer 2: two ways to build it

- **Option A, GameTest.** Real test framework with structures, `maxTicks` timeouts, entity assertions and simulated players. Downsides: pre-release module, needs a world with Beta APIs on, a `.mcstructure` file per test, and structures capped at about 48 to 64 blocks a side (too small for a full quarry).
- **Option B, a Crew test pack using stable APIs only.** A separate behavior pack that, on a command, builds a scenario in a fenced-off area of a flat world (fill blocks, place a chest, spawn a worker, give it a kit), issues an order, waits N ticks, checks the result and prints one `[Crew-Test] PASS/FAIL <name> <json>` line to the server console. Same API surface as the real add-on, no experiments, no size cap.
- **Recommendation:** start with B, because it reuses code the add-on already has and nothing in it is pre-release. Try A in the week 1 spike; adopt it later only if it runs cleanly from the console.

Either way, the test pack is installed on staging only and never on your friends' world.

### What the week 1 spike must answer

1. Can the staging server run the test command from its console with nobody logged in, and does the world keep ticking? If not, the fallback is one idle client (your PC, an alt account) sitting in the test area.
2. Can a script read the results and print them to the console, so Claude can read pass/fail from the log without you?
3. How long does a full run take? Target under 10 minutes.

### Staging vs live

| Server | World | Packs | Who plays |
| --- | --- | --- | --- |
| Staging (new, different port) | Copy of the live world plus a flat test world | Release candidate plus test pack | Claude's scenario tests, your weekly playtest |
| Live (your current server) | Friends' world | Last approved release only | Friends |

Promotion flow, once a week:

1. Lead session builds the release candidate from `main` and tags it `v0.x.y-rc`.
2. Staging gets a fresh copy of the live world (so tests run against real saves and old workers), then the RC.
3. Scenario tests run; Claude reads the log and fixes or reverts anything red.
4. You playtest on staging (see your role below).
5. On your OK: back up the live world (zip with the date and version), stop live, swap packs, start live, watch the log for `[Crew] v0.x.y loaded` and script errors for 10 minutes.
6. Rollback is the same steps with the previous pack and the backup. Never change pack UUIDs, or old saves lose their workers.

Your server autostart session already handles start, stop and recovery, so steps 5 and 6 belong there as a script, not as manual work.

## Your role: product owner, about 4 hours a week

You stop being the tester of everything and become the person who decides and judges feel. Three touchpoints a week:

| When | What you do | Time |
| --- | --- | --- |
| Monday, 30 min | Approve the week's specs: answer their open questions, cut scope, set order | 30 min |
| Midweek, 15 min | Unblock: answer questions builders could not settle, nothing else | 15 min |
| Weekend, 2 to 3 hours | Playtest the release candidate on staging, file findings, approve or hold the release | 2 to 3 hours |

- **Triage rule:** each finding goes in QA.md as bug (fix this week), tweak (batch next week) or idea (roadmap, not this release). Ideas are where V1 dies; park them.
- **Merge approval:** you approve the weekly release, not each branch. The reviewer subagent and the tests approve branches. If you find yourself reviewing diffs, the specs were too vague.
- **What only you can do:** balance numbers (cap, sifter odds), naming, whether something is fun, and anything your friends see.
- **Bring a friend in once,** around week 4. A second player finds the multiplayer and permission bugs that solo testing never will.

## V1 scope and schedule

V1 is five features on top of the Digger/Miner split, shipped as three weekly releases and one final build. The Smith, Builder and the LLM layer start in January.

(The schedule chart lives in the Claude Doc version of this plan.)

A and B are the two builder sessions. Each weekly release goes to staging, then live after your playtest.

1. **Week 1, Nov 16 to 19:** factory setup, staging server, test spike, QA Run D on the Digger/Miner split. You approve the settlement layer and Hauler specs. Done when one scenario test runs on staging and Digger/Miner is either live or held with its bugs listed.
2. **Nov 20 to 29, break:** no planned work, and no sessions run against a server.
3. **Week 2, Nov 30 to Dec 6:** A builds the settlement layer (bell claim, roster, ledger, settlement orders, worker cap). B builds the Hauler. Release 1 on Dec 6: Hauler plus the settlement core.
4. **Week 3, Dec 7 to 13:** A finishes the settlement layer. B builds Woodcutter and Farmer. The lead session runs a load test with 16 to 24 workers and you set the default cap from the result. Release 2 on Dec 13, then the cut-line check.
5. **Week 4, Dec 14 to 20:** A builds the Sifter. B builds Miner prospecting on the existing branch-mine code. A friend joins one staging playtest. Release 3 on Dec 20.
6. **Week 5, Dec 21 to 27:** holiday week, kept light. Fix what the friend playtest found. No new features.
7. **Week 6, Dec 28 to 31:** V1 release candidate on staging Dec 28 and 29, your final playtest, then V1 to live on Dec 31 after a backup.
8. **January:** the Smith, Builder from saved structures, then LLM-driven orders.

You chose prospecting over the Smith on Nov 16. The settlement layer, Hauler, Woodcutter and Farmer still move ahead of prospecting, which changes the order in your Crew Workers Roadmap. I have not edited that doc.

## Risks and cost

The biggest risk is not code quality; it is scope creep plus a week with no work. Mitigations are mostly about saying no.

| Risk | Likelihood | What it costs | Mitigation |
| --- | --- | --- | --- |
| Scope creep from new ideas mid-build | High | A week per idea | Ideas go to the roadmap, never into an open spec; cut line below |
| Staging tests cannot run headless | Medium | Layer 2 needs an idle client or your time | Week 1 spike; fallback is an idle client in the test area |
| Usage limits with parallel sessions | Medium | Builders stall mid-feature | Two builders max; subagents for review only; drop to one builder if limits hit |
| Script performance below 15 workers | Medium | Cap and Hauler design change | Load test in week 3 with 4 friends' worth of workers (16 to 24); measure tick time before prospecting and the Sifter add more work |
| Bedrock update breaks the Script API | Low to medium | A lost weekend | Stable APIs only in the add-on; pin `@minecraft/server` version; keep GameTest out of the shipped packs |
| Merge conflicts between builders | Medium | Hours of untangling | Specs list the files they touch; never two builders in `runner.js` the same week; rebase daily |
| Breaking friends' saved workers | Low, severe | Lost progress and trust | Same UUIDs and `crew:` IDs forever; save-format changes get a migration and a test against a live-world copy |
| AI-written code nobody understands | Medium | Slower fixes later | Reviewer subagent checks for clarity; CHANGELOG entry per merge |

Cost is mostly your time, not money: about 4 hours a week from you, plus the Claude usage you already have. Running two builders roughly doubles usage on build days, which is why the plan caps it at two.

### Cut line

If the Dec 13 release has not shipped settlement layer, Hauler, and Woodcutter plus Farmer, the Sifter moves to January. If Dec 20 slips too, prospecting moves with it and V1 is three features done well. Prospecting goes last because you chose it over the Smith. Three solid features beat five shaky ones on a server your friends play.

## First-week checklist (Nov 16 to 19)

Three evenings before the break. Everything here is setup or testing; no new features.

**Tonight (about 1 hour)**

- [ ] In your local Claude Code session, confirm the repo is in git with everything committed, then push to a new private GitHub repo.
- [ ] Back up the live world (zip, dated) before anything else touches the server.
- [ ] Ask the lead session to rewrite CLAUDE.md with the factory rules from this plan and add a `specs/` folder with the template.
- [ ] Ask it to create `.claude/agents/reviewer.md` and `.claude/agents/test-writer.md`, and the test hooks in `.claude/settings.json`.

**Tuesday (about 2 hours)**

- [ ] Have your server session stand up the staging server on a second port with a copy of the live world.
- [ ] Install the Digger/Miner build on staging and run QA Run D there, not on live.
- [ ] Log every finding in QA.md as bug, tweak or idea.

**Wednesday (about 2 hours)**

- [ ] Run the week 1 spike: one scenario test (a 5x5x3 quarry) in the stable-API test pack, triggered from the staging console with nobody logged in. Record whether it ran and how results reached the log.
- [ ] Fix or revert anything QA Run D found; promote the Digger/Miner build to live only if staging is clean.
- [ ] Approve two specs, settlement layer and Hauler, so builders can start the moment you are back.

**Thursday (30 minutes)**

- [ ] Check Claude usage after three days of factory work. If you hit limits, plan on one builder at a time after the break.
- [ ] Wrap up. Do not leave a builder session running unattended on the live server during the break.
