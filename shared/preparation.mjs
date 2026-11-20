import { OrderError } from "./order-rules.mjs";
import { warehouseStatus } from "./payment.mjs";

export function warehouseLane(order) {
  const status = warehouseStatus(order);
  if (!status) return null;
  if (!status.ready) return "blocked";
  switch (order.prepStatus ?? "not_started") {
    case "not_started":
      return "ready";
    case "in_progress":
      return "working";
    case "prepared":
      return "packed";
    default:
      return "blocked"; // shortage or an unknown persisted value
  }
}

/** null is an exact replay; apply the change only inside the caller's transaction. */
export function nextPreparation(order, command) {
  if (!command || typeof command !== "object" || Array.isArray(command))
    throw new OrderError(400, "Indica una acción de almacén.");
  const { action, foundQuantity } = command;
  if (
    !["start", "complete", "shortage"].includes(action) ||
    Object.keys(command).length !== (action === "shortage" ? 2 : 1)
  )
    throw new OrderError(400, "Acción o campos de preparación no válidos.");
  if (
    action === "shortage" &&
    (!Number.isSafeInteger(foundQuantity) ||
      foundQuantity < 0 ||
      foundQuantity >= order.quantity)
  )
    throw new OrderError(
      400,
      "La cantidad encontrada debe ser un entero desde cero y menor que la solicitada.",
    );
  if (!warehouseStatus(order)?.ready)
    throw new OrderError(
      409,
      "Pedido bloqueado: requiere confirmación, pago acreditado y existencia verificada.",
    );
  const state = order.prepStatus ?? "not_started";
  const target = {
    start: "in_progress",
    complete: "prepared",
    shortage: "shortage",
  }[action];
  if (
    state === target &&
    (action !== "shortage" || order.foundQuantity === foundQuantity)
  )
    return null;
  if (state !== (action === "start" ? "not_started" : "in_progress"))
    throw new OrderError(
      409,
      "La acción ya no corresponde al estado actual del pedido.",
    );
  return {
    prepStatus: target,
    foundQuantity: action === "shortage" ? foundQuantity : null,
  };
}
