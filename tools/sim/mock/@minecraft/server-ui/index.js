// Stub: the forms need a real client. show() cancels, and formLog records the title and buttons
// so a test can check a menu without a client.
export const formLog = [];
class Form {
  constructor() {
    const rec = { title: "", body: "", buttons: [] };
    formLog.push(rec);
    const proxy = new Proxy(this, {
      get(_t, k) {
        if (k === "show") return async () => ({ canceled: true, cancelationReason: "UserClosed" });
        if (k === "then") return undefined;
        return (...args) => {
          if (k === "title") rec.title = String(args[0] ?? "");
          else if (k === "body") rec.body = String(args[0] ?? "");
          else if (k === "button") rec.buttons.push(String(args[0] ?? ""));
          return proxy;
        };
      },
    });
    return proxy;
  }
}
export class ActionFormData extends Form {}
export class ModalFormData extends Form {}
export class MessageFormData extends Form {}
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
