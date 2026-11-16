# Spec: <feature> (v0.x)

Owner: Brian · Status: draft | ready | building | in review | shipped · Branch: `feat/<name>`

<!-- How to use: copy this file to specs/<name>.md. A builder session starts from the spec alone,
so everything it needs is here. Status goes to "ready" only when Brian has answered every open
question. Nothing under Decisions is a guess: guesses go under Open questions. -->

## Player story
One or two sentences in the player's words: what they do and what they get.

## Decisions (from Brian, dated)
- YYYY-MM-DD: each decision, with Brian's words where there are any. Nothing here is the builder's guess.

## Out of scope
- What this feature does not do yet (and where it goes instead: a later spec, the roadmap).

## Done criteria
Every one of these must pass before the branch merges. The `reviewer` subagent checks each.
1. **Mock test:** `<test file>`: <named scenario> -> <expected result>. Runs in `node tools/sim/run.mjs`
   and exits non-zero on a wrong result.
2. **Scenario test on staging:** <setup> -> <expected blocks / items / entities> within <N> ticks;
   prints `[Crew-Test] PASS <name>`.
3. **Playtest check for Brian:** <one thing to look at and feel>.
4. **No new script errors** in the server log over a 30 minute run on staging.

## Touches
- **Files:** which scripts, entity/item JSON, textures, lang, guide pages (so two builders never
  share a file in the same week).
- **Saved data:** new or changed dynamic properties (world and entity), with their `crew:` ids, and
  how old saves are migrated.
- **Player-facing text:** CHANGELOG line, QA.md checks, guide pages.

## Open questions
Numbered, each one Brian can answer in a line. The builder stops on any part that depends on an
unanswered question.
1. ...
