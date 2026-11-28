# Miner branch levels

Copied from `specs/miner-prospecting.md` (Brian, 2026-11-27). The same branch Y values are `ORE_BANDS` in `crew_bp/scripts/prospect.js`. This is not a second table.

Diamond and redstone triangles are centered on the bedrock floor (Y -64). A 2-block tunnel cannot stand in bedrock, so those two branch at Y -59. Coal's even band from Y 136 is the coal level when the entrance can reach it. Overworld only. The spec does not offer ancient debris. `docs/PLAN.md` still lists ancient debris and a Nether start. That file was not edited here.

| Ore | Branch Y | Why |
| --- | --- | --- |
| Coal | 136, or 96 if the start is below 136 | The even band from Y 136 to the top of the world gets more attempts per layer than the triangle that peaks at Y 96. Both are above a typical Y 64 start, so a coal quota there branches at the entrance and records peak 136. |
| Copper | 48 | Triangle from Y -16 to 112, center 48. |
| Iron | 16, or 232 if the start is at or above 232 | Underground triangle from Y -24 to 56, center 16 (Bedrock's blob is one block larger than Java's; the heights match). The mountain triangle centers at 232 and is only a downward level when the entrance is already that high. |
| Emerald | 232 | Mountain triangle. Only a no-quota level when the entrance is at or above 232. A quota below that branches at the entrance and records peak 232. |
| Lapis | 0 | Triangle from Y -32 to 32, center 0. |
| Gold | -16 | Triangle from Y -64 to 32, center -16. Badlands gold higher up is not a separate level. |
| Diamond and redstone | -59 | Both triangles are centered on the bedrock floor (Y -64). Bedrock fills Y -64 and can reach a few layers above it, so a 2-block tunnel stands at Y -59, the lowest clear layer and the measured layer where the most of both ores is found. |

`prospect.js` saves those levels on the worker as `crew:mine.levels` (`{y, ores, peak}`). With no quota and a start at Y 64, the spec's done criterion names Y 48, 16, 0, -16, and -59.
