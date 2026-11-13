// Stub: the forms need a real client, so tests only check that the modules load.
class Form { constructor() { return new Proxy(this, { get: (t, k) => (k === "show" ? async () => ({ canceled: true, cancelationReason: "UserClosed" }) : () => t) }); } }
export class ActionFormData extends Form {}
export class ModalFormData extends Form {}
export class MessageFormData extends Form {}
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
