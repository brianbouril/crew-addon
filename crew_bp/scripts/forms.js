// Showing server-ui forms. A form can't open while the player has another screen up (chat,
// inventory), so keep retrying for a few seconds until they close it.
import { system } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";

/**
 * @template {import("@minecraft/server-ui").ActionFormData | import("@minecraft/server-ui").ModalFormData} F
 * @param {import("@minecraft/server").Player} p @param {F} form
 * @returns {Promise<(F extends import("@minecraft/server-ui").ActionFormData ? import("@minecraft/server-ui").ActionFormResponse : import("@minecraft/server-ui").ModalFormResponse) | undefined>}
 */
export async function show(p, form) {
  for (let i = 0; i < 60; i++) {
    if (!p.isValid) return undefined;
    const r = await /** @type {any} */ (form).show(p);
    if (r.canceled && r.cancelationReason === FormCancelationReason.UserBusy) {
      await system.waitTicks(5);
      continue;
    }
    return r.canceled ? undefined : r;
  }
  return undefined;
}
