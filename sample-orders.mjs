import { initial as blank, createDraft, confirm, reviewPayment, prepare } from "./demo-domain.mjs";

// Registros inventados. Una visita nueva o el reinicio explícito restaura este escenario.
export function initial() {
  const state = blank();
  const pickup = state.slots.find(s => s.id === "pickup");
  pickup.capacity = pickup.remaining = 6;
  const rows = [
    ["ejemplo-centro", "FIL-204", "Centro", 1, null],
    ["ejemplo-norte", "COR-018", "Norte", 2, null],
    ["demo-OP1001", "FRE-110", "Centro", 1, "pending"],
    ["demo-OP1002", "SEN-220", "Norte", 2, "discrepancy"],
    ["demo-OP1004", "RET-410", "Norte", 3, "verified"],
    ["demo-OP1003", "JUN-305", "Centro", 1, "verified"],
  ];
  for (const [id, sku, zone, quantity, payment] of rows) {
    const order = createDraft(state, {sku, zone, quantity, seller: zone === "Centro" ? "Mostrador A" : "Mostrador B", stockVerified:true}, id);
    if (!payment) continue;
    confirm(state,id,"pickup");
    if (payment !== "pending") {
      reviewPayment(state,id,payment);
      if(sku==="RET-410"){ prepare(state,id,{action:"start"}); order.prepUpdatedAt="2026-11-19T14:30:00.000Z"; }
      order.paymentReviewedAt="2026-11-19T14:00:00.000Z";
    }
  }
  return state;
}
