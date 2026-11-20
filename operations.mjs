import { warehouseStatus } from "./shared/payment.mjs";

const $ = (id) => document.getElementById(id);
const element = (tag, text, cls) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const labels = {
  pending: "Pendiente de verificar",
  discrepancy: "Con diferencia",
  verified: "Acreditado",
};
const ref = (o) => "Pedido " + o.id.slice(-8).toUpperCase();
function control(label, style, fn) {
  const button = element("button", label, style);
  button.type = "button";
  button.onclick = fn;
  return button;
}
function row(o) {
  const card = element("article", "", "op-row"),
    info = element("div", "", "op-info");
  info.append(
    element("small", ref(o), "op-ref"),
    element("strong", o.sku),
    element(
      "span",
      o.quantity +
        " ud. · " +
        o.zone +
        " · " +
        (o.slotId === "delivery" ? "Reparto" : "Retiro"),
    ),
  );
  card.append(info);
  return card;
}
export function operations({ client, isDemo, refresh, broadcast }) {
  let page = "sales",
    choice = null,
    writing = false;
  const nav = [...document.querySelectorAll("[data-view]")];
  function message(text, error = false) {
    $("op-notice").textContent = text;
    $("op-notice").classList.toggle("error", error);
  }
  function clearChoice() {
    choice = null;
    $("review-box").hidden = true;
  }
  function ask(order, decision) {
    if (writing) return;
    choice = { id: order.id, decision };
    $("review-title").textContent =
      (decision === "verified" ? "Acreditar pago" : "Registrar diferencia") +
      " · " +
      ref(order) +
      " · " +
      order.sku;
    $("review-detail").textContent =
      decision === "verified"
        ? "Confirma que contrastaste el pago con la fuente autorizada. Un comprobante recibido no basta."
        : "El pago no coincide. El pedido seguirá bloqueado y conservará su cupo.";
    $("review-box").hidden = false;
    message("");
    $("review-submit").focus();
  }
  $("review-cancel").onclick = clearChoice;
  $("review-submit").onclick = async () => {
    if (!choice || writing) return;
    const { id, decision } = choice,
      key = $("admin-key").value;
    if (!isDemo && !key) {
      message("Introduce la clave de administración.", true);
      $("admin-key").focus();
      return;
    }
    writing = true;
    $("review-submit").disabled = true;
    try {
      await client.reviewPayment(id, decision, key);
      clearChoice();
      broadcast();
      message(
        decision === "verified"
          ? "Pago acreditado. La cola de almacén se ha actualizado."
          : "Diferencia registrada. El pedido conserva su cupo.",
      );
    } catch (e) {
      clearChoice();
      message(e.message, true);
    } finally {
      writing = false;
      $("review-submit").disabled = false;
    }
    try {
      await refresh();
    } catch {
      message("No se pudo actualizar la cola. Pulsa Actualizar.", true);
    }
  };
  function render(orders) {
    if (page === "sales") return;
    const confirmed = orders.filter((o) => o.status === "confirmed");
    if (page === "warehouse") {
      const ready = $("ready-list"),
        blocked = $("blocked-list");
      ready.replaceChildren();
      blocked.replaceChildren();
      for (const o of confirmed) {
        const status = warehouseStatus(o),
          card = row(o);
        card.append(
          element(
            "span",
            status.ready ? "Listo para preparar" : status.reason,
            status.ready ? "pill confirmed" : "pill warning",
          ),
        );
        (status.ready ? ready : blocked).append(card);
      }
      for (const [id, list, placeholder] of [
        ["ready-count", ready, "Ningún pedido listo por ahora."],
        ["blocked-count", blocked, "No hay pedidos bloqueados."],
      ]) {
        $(id).textContent = String(list.childElementCount);
        if (!list.childElementCount)
          list.append(element("p", placeholder, "muted"));
      }
      return;
    }
    const list = $("payment-list");
    list.replaceChildren();
    const arranged = [...confirmed].sort(
      (a, b) =>
        Number(a.paymentStatus === "verified") -
        Number(b.paymentStatus === "verified"),
    );
    for (const o of arranged) {
      const card = row(o),
        status = o.paymentStatus ?? "pending",
        actions = element("div", "", "op-actions");
      const reviewed = o.paymentReviewedAt
        ? new Date(o.paymentReviewedAt).toLocaleString("es-VE")
        : null;
      card.firstChild.append(
        element(
          "small",
          labels[status] + (reviewed ? " · " + reviewed : ""),
          "op-meta",
        ),
      );
      if (status !== "verified") {
        actions.append(
          control("Acreditar pago", "primary", () => ask(o, "verified")),
        );
        if (status !== "discrepancy")
          actions.append(
            control("Registrar diferencia", "ghost", () =>
              ask(o, "discrepancy"),
            ),
          );
      }
      card.append(actions);
      list.append(card);
    }
    if (!confirmed.length)
      list.append(
        element("p", "No hay pedidos confirmados para revisar.", "muted"),
      );
  }
  async function navigate(next) {
    if (writing) return;
    page = next;
    clearChoice();
    message("");
    if (next !== "admin") $("admin-key").value = "";
    for (const b of nav)
      b.setAttribute("aria-pressed", String(b.dataset.view === next));
    $("sales-panel").hidden = next !== "sales";
    $("ops-panel").hidden = next === "sales";
    $("warehouse-panel").hidden = next !== "warehouse";
    $("admin-panel").hidden = next !== "admin";
    if (next !== "admin") $("payment-list").replaceChildren();
    $("admin-login").hidden = isDemo;
    $("op-mode").textContent = isDemo
      ? "Demo ficticia · Los roles se simulan en este navegador."
      : "Piloto local · Solo administración puede registrar una revisión.";
    try {
      await refresh();
    } catch {
      message("No se pudo leer la jornada. Vuelve a cargarla.", true);
    }
  }
  for (const b of nav) b.onclick = () => navigate(b.dataset.view);
  $("op-refresh").onclick = () =>
    refresh().catch(() => message("No se pudo actualizar.", true));
  // BroadcastChannel covers sibling tabs; polling covers other browser profiles on the same instance.
  let syncing = false;
  async function syncWarehouse() {
    if (
      page !== "warehouse" ||
      writing ||
      syncing ||
      document.visibilityState !== "visible"
    )
      return;
    syncing = true;
    try {
      await refresh();
    } catch {
      message(
        "No se pudo actualizar. La cola puede estar desactualizada.",
        true,
      );
    } finally {
      syncing = false;
    }
  }
  document.addEventListener("visibilitychange", syncWarehouse);
  window.setInterval(syncWarehouse, 8000);
  return { render };
}
