# Player feedback inbox

SAMPLE NOTES ONLY. Written on day 0 to test authority governance. They are not reports from the live server, not Brian's decisions, and not quotes from a real player. Do not apply them to `knowledge/domain/` or to the packs.

Each heading carries an authority tag. Higher authority wins (`AGENTS.md`): `art-director` > `official-docs` > `contributor` > `player-feedback`. A note that loses is logged in the curator commit and left unapplied.

The shipped hat colors and the 16×16 item icon are `official-docs`: they are in `tools/make_textures.mjs` and the PNGs, and they are summarized as rules in `knowledge/domain/visual-identity.md`. No `art-director` note in this file contradicts them.

## SAMPLE-1 · authority: `player-feedback`

**Status:** sample. Not a real player.

**Says:** Paint every worker's hard hat the same neon green, `#00FF00`, including the Miner. One bright color is easier to see in a cave than four earth tones. Yellow reads as a construction cone and should go.

**Conflicts with:** `knowledge/domain/visual-identity.md`, which says hat colors are role identity and the Miner hat stays `#f5c414` / `#cd9b0a`, and which records that no shipped PNG contains `#00FF00`. Also conflicts with SAMPLE-2.

**Expected curator result:** do not change the palette. Log this note as outranked `player-feedback`.

## SAMPLE-2 · authority: `player-feedback`

**Status:** sample. Not a real player. A different voice from SAMPLE-1, on purpose.

**Says:** Keep the four hat colors. The yellow Miner hat is how you tell a Miner from a Digger without opening the menu. Do not make the hats match, and do not use green. Green on a mob reads as a creeper.

**Conflicts with:** SAMPLE-1. It agrees with the current Miner yellow `#f5c414`, Digger `#ececec`, Woodcutter `#de5420`, and Farmer `#dec070`.

**Expected curator result:** still do not treat this as new authority. It happens to match `official-docs`. Matching is not a promotion in rank. No knowledge edit is required to "accept" it.

## SAMPLE-3 · authority: `contributor`

**Status:** sample. Not a real teammate request.

**Says:** Redraw `crew_rp/textures/items/crew_survey_stake.png` at 32×32 and put a 1 pixel `#000000` outline on it so the hotbar icon reads. 16×16 is too small on a TV.

**Conflicts with:** `knowledge/domain/visual-identity.md` (item icons are 16×16; no shipped texture contains a `#000000` pixel) and with the generator's `stake()` function, which builds a 16×16 canvas. Outranks SAMPLE-1 and SAMPLE-2, and still loses to `official-docs`.

**Expected curator result:** do not change the icon size or add a black outline. Log it under `Needs human decision` only if a later `art-director` note asks for a real hotbar-size change. Until then it is a rejected suggestion, not an open product question the curator has to escalate every run.
