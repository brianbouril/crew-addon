// Writes PLAYER_GUIDE.md from the in-game guide pages (crew_bp/scripts/guide_pages.js), so the
// shareable guide always says the same as /crew:help. Node 18+, no installs.
// Usage: node tools/make_guide.mjs   (from the project folder)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { PAGES } = await import(pathToFileURL(join(ROOT, "crew_bp/scripts/guide_pages.js")).href);

/** Minecraft colour codes to Markdown: highlighted words become bold, other codes are dropped. @param {string} s */
const md = (s) => s.replace(/§e(.*?)§r/g, "**$1**").replace(/§./g, "");

const out = [
  "# Crew Workers: player guide",
  "",
  "Little workers that dig for you on this server. The same guide is in game: type `/crew:help`,",
  "or pick \"How workers work\" in any worker's menu.",
  "",
  ...PAGES.map((p, i) => `${i + 1}. [${p.title}](#${p.title.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")})`),
  "",
];
for (const p of PAGES) {
  const lines = p.body.split("\n").slice(2); // drop the in-game heading and the blank line after it
  out.push(`## ${p.title}`, "", ...lines.map(md), "");
}
writeFileSync(join(ROOT, "PLAYER_GUIDE.md"), out.join("\n"));
console.log(`PLAYER_GUIDE.md written (${PAGES.length} topics)`);
