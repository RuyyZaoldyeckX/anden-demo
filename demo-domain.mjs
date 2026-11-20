import {
  draftFields,
  OrderError,
  quoteFor,
  reservationNeeded,
} from "./shared/order-rules.mjs";

export function initial() {
  return {
    orders: [
      { id: "ejemplo-centro", sku: "FIL-204", quantity: 1, zone: "Centro", stockVerified: true, seller: "Mostrador A", status: "draft", slotId: null },
      { id: "ejemplo-norte", sku: "COR-018", quantity: 2, zone: "Norte", stockVerified: true, seller: "Mostrador B", status: "draft", slotId: null }
    ],
    slots: [
      {
        id: "delivery",
        label: "Entrega a domicilio",
        capacity: 1,
        remaining: 1,
        costCents: 300,
      },
      {
        id: "pickup",
        label: "Retiro en tienda",
        capacity: 2,
        remaining: 2,
        costCents: 0,
      },
    ],
  };
}

export function createDraft(state, input, id) {
  const order = { id, ...draftFields(input), status: "draft", slotId: null };
  state.orders.unshift(order);
  return order;
}

function requiredOrder(state, id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) throw new OrderError(404, "Pedido no encontrado.");
  return order;
}

export function quote(state, id) {
  return quoteFor(requiredOrder(state, id), state.slots);
}

export function verifyStock(state, id) {
  const order = requiredOrder(state, id);
  order.stockVerified = true;
  return order;
}

export function confirm(state, id, slotId) {
  const order = requiredOrder(state, id);
  if (!reservationNeeded(order, slotId, state.slots)) return order;
  state.slots.find((slot) => slot.id === slotId).remaining--;
  order.status = "confirmed";
  order.slotId = slotId;
  return order;
}
