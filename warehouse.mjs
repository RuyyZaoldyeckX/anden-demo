import { warehouseLane } from "./shared/preparation.mjs";
import { warehouseStatus } from "./shared/payment.mjs";

const $ = (id) => document.getElementById(id);
const lanes = {
  ready: "No hay pedidos listos para iniciar.",
  working: "No hay pedidos en preparación.",
  packed: "Todavía no hay pedidos preparados.",
  blocked: "No hay pedidos bloqueados.",
};

// El formulario de conteo vive fuera de las colas: las actualizaciones no borran lo que escribe el operario.
export function warehouseView({
  client,
  isDemo,
  refresh,
  broadcast,
  row,
  control,
  message,
}) {
  let choice = null,
    writing = false;
  const box = $("prep-form"),
    qty = $("found-quantity"),
    submit = $("prep-submit"),
    key = $("warehouse-key");
  $("warehouse-login").hidden = isDemo;
  function dismiss() {
    choice = null;
    box.hidden = true;
    qty.value = "";
  }
  function ask(order, action) {
    if (writing) return;
    choice = { id: order.id, action };
    const shortage = action === "shortage";
    $("prep-title").textContent =
      (shortage ? "Reportar faltante" : "Verificar preparación") +
      " · " +
      order.sku +
      " · " +
      order.id.slice(-8).toUpperCase();
    $("prep-help").textContent = shortage
      ? "Registra cuántas unidades encontraste de las " +
        order.quantity +
        " solicitadas. El pedido quedará bloqueado sin perder su reserva."
      : "Confirma que contaste y preparaste las " +
        order.quantity +
        " unidades solicitadas. Esta acción no despacha el pedido.";
    $("found-field").hidden = !shortage;
    qty.disabled = !shortage;
    qty.required = shortage;
    qty.max = String(order.quantity - 1);
    qty.value = "";
    submit.textContent = shortage
      ? "Guardar faltante"
      : "Confirmar preparación";
    box.hidden = false;
    message("");
    (shortage ? qty : submit).focus();
  }
  async function execute(id, command) {
    if (writing) return;
    if (!isDemo && !key.value) {
      message("Introduce la clave de almacén.", true);
      key.focus();
      return;
    }
    writing = true;
    submit.disabled = true;
    try {
      await client.prepare(id, command, key.value);
      dismiss();
      broadcast();
      message(
        {
          start: "Preparación iniciada.",
          complete: "Pedido preparado. Aún no ha sido despachado.",
          shortage: "Faltante registrado. Se conserva el cupo del pedido.",
        }[command.action],
      );
    } catch (e) {
      message(e.message, true);
    } finally {
      writing = false;
      submit.disabled = false;
    }
    try {
      await refresh();
    } catch {
      message("No se pudo actualizar la cola. Pulsa Actualizar cola.", true);
    }
  }
  box.onsubmit = (e) => {
    e.preventDefault();
    if (!choice) return;
    const { id, action } = choice;
    execute(
      id,
      action === "shortage"
        ? { action, foundQuantity: qty.valueAsNumber }
        : { action },
    );
  };
  $("prep-cancel").onclick = () => {
    if (!writing) dismiss();
  };
  function render(orders) {
    const groups = Object.fromEntries(Object.keys(lanes).map((l) => [l, []]));
    for (const o of orders) {
      const lane = warehouseLane(o);
      if (lane) groups[lane].push(o);
    }
    // Otra pestaña pudo cerrar el pedido mientras se contaba. Nunca sustituir su decisión.
    if (choice && !groups.working.some((o) => o.id === choice.id) && !writing) {
      dismiss();
      message("El pedido cambió en otra vista. Revisa su estado actualizado.");
    }
    for (const [lane, list] of Object.entries(groups)) {
      const target = $(lane + "-list");
      target.replaceChildren();
      $(lane + "-count").textContent = String(list.length);
      if (!list.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = lanes[lane];
        target.append(p);
        continue;
      }
      for (const o of list) {
        const card = row(o);
        const actions = document.createElement("div");
        actions.className = "op-actions";
        if (lane === "ready")
          actions.append(
            control("Iniciar preparación", "primary", () =>
              execute(o.id, { action: "start" }),
            ),
          );
        if (lane === "working")
          actions.append(
            control("Marcar preparado", "primary", () => ask(o, "complete")),
            control("Reportar faltante", "ghost", () => ask(o, "shortage")),
          );
        if (lane === "blocked" || lane === "packed") {
          const badge = document.createElement("span");
          badge.className =
            lane === "packed" ? "pill confirmed" : "pill warning";
          badge.textContent =
            lane === "packed"
              ? "Preparado · sin despachar"
              : o.prepStatus === "shortage"
                ? "Faltante: " +
                  o.foundQuantity +
                  " de " +
                  o.quantity +
                  " encontradas"
                : (warehouseStatus(o)?.ready
                    ? "Estado de preparación no reconocido"
                    : warehouseStatus(o)?.reason) || "Requiere revisión";
          actions.append(badge);
        }
        card.append(actions);
        target.append(card);
      }
    }
  }
  return {
    render,
    leave() {
      dismiss();
      key.value = "";
    },
    get busy() {
      return writing;
    },
  };
}
