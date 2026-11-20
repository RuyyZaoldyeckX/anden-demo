import { OrderError } from "./order-rules.mjs";

// A receipt is not a payment review. Only an explicit administrative decision can unlock a promise.
export function paymentChangeNeeded(order, decision) {
  if (decision !== "verified" && decision !== "discrepancy")
    throw new OrderError(400, "Decisión de pago no válida.");
  if (order.status !== "confirmed")
    throw new OrderError(409, "Solo se revisan pagos de pedidos confirmados.");
  if (order.paymentStatus === decision) return false;
  if (order.paymentStatus === "verified")
    throw new OrderError(
      409,
      "El pago ya está acreditado y no puede modificarse aquí.",
    );
  return true;
}

export function warehouseStatus(order) {
  if (order.status !== "confirmed") return null;
  const reasons = [];
  if (order.paymentStatus === "discrepancy") reasons.push("Diferencia de pago");
  else if (order.paymentStatus !== "verified")
    reasons.push("Pago pendiente de verificar");
  if (order.stockVerified !== true) reasons.push("Existencia sin verificar");
  return {
    ready: !reasons.length,
    reason: reasons.join(" · ") || "Pago y existencia verificados",
  };
}
