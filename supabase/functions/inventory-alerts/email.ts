import type { EmailMessage, LotRow } from "./types.ts";

const MAX_LISTED_LOTS = 15;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function singleLine(value: string, max = 60): string {
  // deno-lint-ignore no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
}

function formatDate(iso: string) {
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
}

function formatQuantity(value: number) {
  return Number(value).toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

function expiryText(days: number) {
  if (days < 0) return `venció hace ${-days} ${days === -1 ? "día" : "días"}`;
  if (days === 0) return "caduca hoy";
  return `caduca en ${days} ${days === 1 ? "día" : "días"}`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function baseUrl(appUrl: string) {
  return /^https?:\/\//.test(appUrl) ? appUrl.replace(/\/+$/, "") : "";
}

function lotsUrl(appUrl: string, productId?: string) {
  const base = baseUrl(appUrl);
  if (!base) return "";
  return productId && UUID_PATTERN.test(productId)
    ? `${base}/lots?product=${productId}`
    : `${base}/lots`;
}

function count(lots: LotRow[]) {
  return {
    vencidos: lots.filter((l) => l.status === "vencido").length,
    porVencer: lots.filter((l) => l.status === "por_vencer").length,
  };
}

function sorted(lots: LotRow[]) {
  return [...lots].sort(
    (a, b) =>
      a.expiration_date.localeCompare(b.expiration_date) ||
      a.product_name.localeCompare(b.product_name),
  );
}

function statusLabel(status: LotRow["status"]) {
  return status === "vencido" ? "VENCIDO · no apto para la venta" : "POR VENCER";
}

function lotHtml(lot: LotRow, appUrl: string) {
  const expired = lot.status === "vencido";
  const color = expired ? "#B93838" : "#A96812";
  const bg = expired ? "#FDE8E7" : "#FFF2D8";
  const url = lotsUrl(appUrl, lot.product_id);
  const name = escapeHtml(lot.product_name);
  const title = url
    ? `<a href="${escapeHtml(url)}" style="color:#075747;text-decoration:underline">${name}</a>`
    : name;
  const supplier = lot.supplier_lot_code
    ? `<br>Lote del proveedor: ${escapeHtml(lot.supplier_lot_code)}`
    : "";
  return `<div style="border:1px solid #E1E6E1;border-radius:12px;padding:12px;margin:0 0 10px;background:#FFFFFF">
<p style="margin:0 0 6px;font-size:16px;font-weight:600">${title}</p>
<p style="margin:0 0 6px"><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${bg};color:${color};font-size:13px;font-weight:600">${statusLabel(lot.status)}</span></p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#17211D">Caducidad: <strong>${formatDate(lot.expiration_date)}</strong> (${expiryText(lot.days_to_expiry)})<br>Existencia: ${formatQuantity(lot.current_quantity)} ${escapeHtml(lot.unit)}${supplier}</p>
</div>`;
}

function lotText(lot: LotRow) {
  const supplier = lot.supplier_lot_code ? ` · Lote del proveedor: ${lot.supplier_lot_code}` : "";
  return `- ${lot.product_name} [${statusLabel(lot.status)}]\n  Caducidad: ${formatDate(lot.expiration_date)} (${expiryText(lot.days_to_expiry)}) · Existencia: ${formatQuantity(lot.current_quantity)} ${lot.unit}${supplier}`;
}

function layout(args: {
  title: string;
  preheader: string;
  body: string;
  storeName: string;
  appUrl: string;
}) {
  const url = lotsUrl(args.appUrl);
  const cta = url
    ? `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#075747;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px">Ver todos los lotes</a></p>`
    : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(args.title)}</title></head>
<body style="margin:0;background:#F7F6F1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#17211D">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(args.preheader)}</div>
<div style="max-width:600px;margin:0 auto;padding:16px">
<p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#075747">TADUKA</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${escapeHtml(args.title)}</h1>
${args.body}
${cta}
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#66736C">Recibes este correo porque creaste la tienda «${escapeHtml(args.storeName)}» en TADUKA. Las cantidades son las registradas en la aplicación; confirma siempre la fecha en el empaque.</p>
</div></body></html>`;
}

function summaryBlock(vencidos: number, porVencer: number, alertDays: number) {
  return `<p style="margin:0 0 6px;font-size:15px"><strong>Vencidos con existencia:</strong> ${vencidos}</p>
<p style="margin:0 0 16px;font-size:15px"><strong>Por vencer</strong> (en ${plural(alertDays, "día", "días")} o menos)<strong>:</strong> ${porVencer}</p>`;
}

function listBlock(lots: LotRow[], appUrl: string) {
  const shown = lots.slice(0, MAX_LISTED_LOTS);
  const extra = lots.length - shown.length;
  const more =
    extra > 0
      ? `<p style="margin:0 0 10px;font-size:14px;color:#66736C">y ${plural(extra, "lote más", "lotes más")}.</p>`
      : "";
  return `<h2 style="margin:16px 0 10px;font-size:17px">Lotes prioritarios (primero los que vencen antes)</h2>
${shown.map((l) => lotHtml(l, appUrl)).join("\n")}
${more}`;
}

export function buildDailySummary(args: {
  storeName: string;
  localDate: string;
  alertDays: number;
  lots: LotRow[];
  appUrl: string;
}): EmailMessage {
  const lots = sorted(args.lots);
  const { vencidos, porVencer } = count(lots);
  const store = singleLine(args.storeName);

  if (lots.length === 0) {
    const text = `Hoy no hay alertas pendientes en ${store}. Ningún lote con existencia está vencido ni vence en ${plural(args.alertDays, "día", "días")} o menos.`;
    return {
      subject: `TADUKA · Sin alertas de caducidad · ${store}`,
      html: layout({
        title: "Resumen diario: sin alertas pendientes",
        preheader: "No hay lotes vencidos ni por vencer.",
        body: `<p style="margin:0;font-size:15px;line-height:1.5">${escapeHtml(text)}</p>`,
        storeName: args.storeName,
        appUrl: args.appUrl,
      }),
      text: `TADUKA · Resumen diario (${args.localDate})\n\n${text}\n${lotsUrl(args.appUrl)}`,
    };
  }

  const headline = `${plural(vencidos, "vencido", "vencidos")} · ${plural(porVencer, "por vencer", "por vencer")}`;
  return {
    subject: `TADUKA · ${headline} · ${store}`,
    html: layout({
      title: `Resumen diario de ${args.storeName}`,
      preheader: headline,
      body: summaryBlock(vencidos, porVencer, args.alertDays) + listBlock(lots, args.appUrl),
      storeName: args.storeName,
      appUrl: args.appUrl,
    }),
    text: [
      `TADUKA · Resumen diario de ${store} (${args.localDate})`,
      `Vencidos con existencia: ${vencidos}`,
      `Por vencer (en ${plural(args.alertDays, "día", "días")} o menos): ${porVencer}`,
      "",
      "Lotes prioritarios (primero los que vencen antes):",
      ...lots.slice(0, MAX_LISTED_LOTS).map(lotText),
      lots.length > MAX_LISTED_LOTS ? `y ${lots.length - MAX_LISTED_LOTS} más.` : "",
      lotsUrl(args.appUrl),
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n"),
  };
}

export function buildUrgentAlert(args: {
  storeName: string;
  alertDays: number;
  lots: LotRow[];
  appUrl: string;
}): EmailMessage {
  const lots = sorted(args.lots);
  const { vencidos, porVencer } = count(lots);
  const store = singleLine(args.storeName);
  const parts = [
    vencidos > 0 ? plural(vencidos, "lote vencido", "lotes vencidos") : "",
    porVencer > 0 ? plural(porVencer, "lote por vencer", "lotes por vencer") : "",
  ].filter(Boolean);
  const headline = parts.join(" y ");

  return {
    subject: `TADUKA · Alerta: ${headline} · ${store}`,
    html: layout({
      title: `Alerta de caducidad en ${args.storeName}`,
      preheader: headline,
      body:
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Estos lotes con existencia cambiaron de estado: ${escapeHtml(headline)}. Los lotes vencidos no son aptos para la venta.</p>` +
        listBlock(lots, args.appUrl),
      storeName: args.storeName,
      appUrl: args.appUrl,
    }),
    text: [
      `TADUKA · Alerta de caducidad en ${store}`,
      `${headline}. Los lotes vencidos no son aptos para la venta.`,
      "",
      ...lots.slice(0, MAX_LISTED_LOTS).map(lotText),
      lots.length > MAX_LISTED_LOTS ? `y ${lots.length - MAX_LISTED_LOTS} más.` : "",
      lotsUrl(args.appUrl),
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n"),
  };
}
