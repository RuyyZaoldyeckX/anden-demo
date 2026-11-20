import { client, isDemo } from "./client.mjs";
const $ = (id) => document.getElementById(id);
const view = { orders: [], slots: [], active: null, quote: null, busy: false };
const channel =
  "BroadcastChannel" in window ? new BroadcastChannel("anden-jornada") : null;
const el = (tag, txt, cls) => {
  const e = document.createElement(tag);
  if (txt !== undefined) e.textContent = txt;
  if (cls) e.className = cls;
  return e;
};
const button = (txt, action, cls = "ghost") => {
  const b = el("button", txt, cls);
  b.type = "button";
  b.onclick = () => run(action);
  return b;
};
const money = (c) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
const name = (id) => (id === "delivery" ? "Reparto" : "Retiro en tienda");
function notice(txt = "", error = false) {
  $("notice").textContent = txt;
  $("notice").classList.toggle("error", error);
}
async function read() {
  const { orders, slots } = await client.state();
  Object.assign(view, { orders, slots });
  render();
}
async function run(action) {
  if (view.busy) return;
  view.busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await action();
  } catch (e) {
    notice(e.message || "No se pudo completar la acción.", true);
  } finally {
    view.busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
function empty(title, subtitle) {
  const box = el("div", undefined, "empty");
  box.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="#496a54" stroke-width="1.7"><path d="m6 15 18-9 18 9-18 9zM6 15v20l18 9 18-9V15M24 24v20M15 10.5l18 9v7"/></svg>';
  box.append(el("b", title), el("p", subtitle));
  return box;
}
function render() {
  const slots = $("slots");
  slots.replaceChildren();
  for (const s of view.slots) {
    const card = el("div", undefined, "slot"),
      meter = el("div", undefined, "meter"),
      fill = el("i");
    fill.style.width =
      (s.capacity ? (100 * s.remaining) / s.capacity : 0) + "%";
    meter.append(fill);
    card.append(
      el("div", name(s.id), "slot-title"),
      el("strong", String(s.remaining)),
      el("small", "de " + s.capacity + " libres"),
      meter,
    );
    slots.append(card);
  }
  const list = $("orders");
  list.replaceChildren();
  if (!view.orders.length)
    list.append(
      el(
        "p",
        "Aún no hay pedidos. Crea el primero desde el mostrador.",
        "muted",
      ),
    );
  for (const o of view.orders) {
    const row = el("div", undefined, "order");
    row.dataset.status = o.status;
    const text = el("div", undefined, "order-text");
    text.append(
      el("b", o.sku),
      el("small", o.seller + " · " + o.zone + " · " + o.quantity + " ud."),
    );
    row.append(
      text,
      el(
        "span",
        o.status === "draft" ? "Borrador" : "Confirmado",
        "pill " + o.status,
      ),
      button(o.id === view.active ? "Seleccionado" : "Ver pedido", async () => {
        view.active = o.id;
        view.quote = null;
        notice();
        await read();
        $("detail").scrollIntoView({ block: "nearest" });
      }),
    );
    list.append(row);
  }
  const detail = $("detail"),
    o = view.orders.find((o) => o.id === view.active);
  detail.replaceChildren();
  if (!o) {
    detail.append(
      empty(
        "Selecciona un pedido",
        "Crea un borrador o abre uno de la lista para comparar modalidades.",
      ),
    );
    return;
  }
  const header = el("div", undefined, "selected"),
    text = el("div");
  text.append(
    el("b", o.sku),
    el("small", o.quantity + " ud. · " + o.zone + " · " + o.seller),
  );
  header.append(
    text,
    el(
      "span",
      o.status === "draft" ? "Borrador" : "Confirmado",
      "pill " + o.status,
    ),
  );
  detail.append(header);
  if (o.status === "confirmed") {
    detail.append(
      el("b", name(o.slotId) + " confirmado"),
      el(
        "p",
        "Este pedido ya tiene su cupo. No se generará otra reserva.",
        "muted",
      ),
    );
    return;
  }
  if (!o.stockVerified) {
    detail.append(
      el(
        "p",
        "Pendiente de existencia. Comprueba la pieza y la cantidad en la tienda antes de continuar.",
        "muted",
      ),
      button("Registrar existencia verificada", async () => {
        await client.verifyStock(o.id);
        view.quote = null;
        await read();
        channel?.postMessage("refresh");
        notice("Existencia registrada. Ahora puedes cotizar.");
      }),
    );
    return;
  }
  const loadQuote = async () => {
    view.quote = await client.quote(o.id);
    await read();
    notice(
      view.quote?.options.length
        ? "Cotización lista. Todavía no se ha reservado ningún cupo."
        : "",
    );
  };
  detail.append(
    button(
      view.quote ? "Volver a cotizar" : "Cotizar opciones",
      loadQuote,
      "primary",
    ),
  );
  if (!view.quote) return;
  if (!view.quote.options.length) {
    detail.append(
      el("p", view.quote.reason || "Sin opciones en esta jornada.", "muted"),
    );
    return;
  }
  for (const s of view.quote.options) {
    const row = el("div", undefined, "option"),
      info = el("div");
    info.append(
      el("b", name(s.id)),
      el("small", money(s.costCents) + " · jornada piloto"),
    );
    row.append(
      info,
      button(
        s.id === "delivery" ? "Confirmar reparto" : "Confirmar retiro",
        async () => {
          try {
            await client.confirm(o.id, s.id);
          } catch (e) {
            view.quote = await client.quote(o.id);
            await read();
            notice(e.message, true);
            return;
          }
          view.quote = null;
          await read();
          channel?.postMessage("refresh");
          notice("Confirmación registrada.");
        },
      ),
    );
    detail.append(row);
  }
}
$("mode").textContent = isDemo ? "Demo de navegador" : "API · SQLite";
$("scope").textContent = isDemo
  ? "Demo con datos ficticios. Se comparte entre pestañas de este navegador, no entre equipos."
  : "Jornada de prueba · Base SQLite compartida por los clientes de esta instancia local.";
$("reset").hidden = !isDemo;
$("reset").onclick = () =>
  run(async () => {
    if (
      !window.confirm(
        "¿Borrar los pedidos ficticios y restablecer los cupos de esta demo?",
      )
    )
      return;
    await client.reset();
    view.active = null;
    view.quote = null;
    await read();
    channel?.postMessage("refresh");
    notice("Demo reiniciada.");
  });
$("refresh").onclick = () =>
  run(async () => {
    view.quote = null;
    await read();
    notice("Disponibilidad actualizada.");
  });
$("new-order").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const f = event.target,
      data = new FormData(f);
    const o = await client.create({
      sku: data.get("sku"),
      quantity: Number(data.get("quantity")),
      zone: data.get("zone"),
      seller: data.get("seller"),
      stockVerified: data.has("stockVerified"),
    });
    view.active = o.id;
    view.quote = null;
    f.elements.sku.value = "";
    f.elements.stockVerified.checked = false;
    await read();
    channel?.postMessage("refresh");
    notice("Borrador creado. Ningún cupo reservado.");
  });
});
if (channel)
  channel.onmessage = () => {
    if (!view.busy) read().catch((e) => notice(e.message, true));
  };
read().catch(() =>
  notice(
    "No se pudo leer la jornada. Comprueba la conexión o el almacenamiento del navegador y pulsa Actualizar.",
    true,
  ),
);
