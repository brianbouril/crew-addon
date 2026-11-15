// The in-game player guide: /crew:guide, "How it works" in the worker and stake menus, and a
// one-time welcome line for each player. Short pages, written for players, not developers.
// Keep it in step with what the add-on does (README "How it works" says the same things).
import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { show } from "./forms.js";
import { tell } from "./util.js";
import { PAGES } from "./guide_pages.js";

export { PAGES };

/**
 * The guide: a list of topics, each opening a page with Back and Close.
 * @param {import("@minecraft/server").Player} p @param {number} [page]
 */
export async function openGuide(p, page) {
  for (;;) {
    if (page === undefined) {
      const f = new ActionFormData().title("Crew Workers: how it works").body("Little workers that dig for you. Pick a topic:");
      for (const pg of PAGES) f.button(pg.title);
      f.button("Close");
      const r = await show(p, f);
      if (!r || r.selection === undefined || r.selection >= PAGES.length) return;
      page = r.selection;
    }
    const pg = PAGES[page];
    const f = new ActionFormData().title(pg.title).body(pg.body);
    const hasNext = page + 1 < PAGES.length;
    if (hasNext) f.button(`Next: ${PAGES[page + 1].title}`);
    f.button("All topics").button("Close");
    const r = await show(p, f);
    if (!r || r.selection === undefined) return;
    const pick = hasNext ? r.selection : r.selection + 1;
    if (pick === 0) page++;
    else if (pick === 1) page = undefined;
    else return;
  }
}

/** One chat line the first time each player joins a world with the add-on. */
export function startWelcome() {
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const p = ev.player;
    if (p.getDynamicProperty("crew:welcomed")) return;
    p.setDynamicProperty("crew:welcomed", true);
    tell(p, "This world has §eCrew Workers§r: little workers that dig for you. Type §e/crew:guide§r to see how they work.");
  });
}
