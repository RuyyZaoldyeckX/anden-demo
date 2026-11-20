/** Independent of SQLite, transports and UI. One small order occupies one service slot. */
export class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, name) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
    throw new OrderError(400, name + ": se requieren entre 1 y 80 caracteres.");
  }
  return value.trim();
}

export function draftFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new OrderError(400, "El pedido debe ser un objeto.");
  }
  const { quantity, stockVerified, zone } = input;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) {
    throw new OrderError(400, "La cantidad debe ser un entero entre 1 y 9999.");
  }
  if (!["Centro", "Norte"].includes(zone))
    throw new OrderError(400, "Zona no admitida.");
  if (typeof stockVerified !== "boolean")
    throw new OrderError(400, "Indica si verificaste la existencia.");
  return {
    sku: text(input.sku, "Pieza"),
    seller: text(input.seller, "Vendedor"),
    quantity,
    zone,
    stockVerified,
  };
}

export function quoteFor(order, slots) {
  if (order.status === "confirmed")
    return { options: [], reason: "El pedido ya fue confirmado." };
  if (!order.stockVerified)
    return { options: [], reason: "Existencia sin verificar." };
  const options = slots.filter((slot) => slot.remaining > 0);
  return options.length
    ? { options }
    : { options, reason: "No quedan cupos disponibles." };
}

/** Under the caller's transaction: false is a replay, true permits a new reservation. */
export function reservationNeeded(order, slotId, slots) {
  if (!slots.some((s) => s.id === slotId))
    throw new OrderError(400, "Opción desconocida.");
  if (order.status === "confirmed") {
    if (order.slotId === slotId) return false;
    throw new OrderError(409, "Este pedido ya se confirmó con otra opción.");
  }
  const quote = quoteFor(order, slots);
  if (!quote.options.some((s) => s.id === slotId)) {
    throw new OrderError(
      409,
      quote.reason ?? "Ese cupo ya no está disponible. Vuelve a cotizar.",
    );
  }
  return true;
}
