// Edge Function (Deno): resumen diario y alertas urgentes de caducidad por correo.
// Invocada por pg_cron con el encabezado x-cron-secret. Ver README.md.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkConfig } from "./config.ts";
import { createHandler } from "./handler.ts";
import { createResendMailer } from "./resend.ts";
import type { Db, Deps, Directory, LotRow, Store } from "./types.ts";

const LOT_COLUMNS =
  "id, product_id, product_name, unit, supplier_lot_code, expiration_date, current_quantity, days_to_expiry, status";

function buildDeps(): Deps {
  // service_role se usa solo aquí, en el servidor, y solo para: leer tiendas/lotes/productos,
  // resolver el correo del creador de la tienda en Auth y manejar notification_log.
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}_${error.code ?? "error"}`);
    return data;
  };

  const db: Db = {
    async detectDailyItems(localDate) {
      await rpc("detect_daily_items", { p_local_date: localDate });
    },
    async detectUrgentItems() {
      await rpc("detect_urgent_items", {});
    },
    async assembleBatches() {
      await rpc("assemble_batches", {});
    },
    async claimBatches(kind) {
      const rows = (await rpc("claim_batches", { p_kind: kind })) as {
        batch_id: string;
        store_id: string;
        kind: "daily_summary" | "urgent_alert";
        attempts: number;
        recipient: string | null;
        subject: string | null;
        html: string | null;
        text_body: string | null;
      }[];
      return rows.map((r) => ({
        id: r.batch_id,
        storeId: r.store_id,
        kind: r.kind,
        attempts: r.attempts,
        snapshot:
          r.recipient && r.subject && r.html && r.text_body
            ? { recipient: r.recipient, subject: r.subject, html: r.html, text: r.text_body }
            : null,
      }));
    },
    async getBatchItems(batchId) {
      const { data, error } = await client
        .from("notification_log")
        .select("id, lot_id, notified_status, local_date")
        .eq("batch_id", batchId)
        .eq("status", "pending");
      if (error) throw new Error(`notification_log_${error.code ?? "error"}`);
      return (data ?? []).map((r) => ({
        logId: r.id as string,
        lotId: (r.lot_id as string | null) ?? null,
        notifiedStatus: (r.notified_status as "por_vencer" | "vencido" | null) ?? null,
        localDate: (r.local_date as string | null) ?? null,
      }));
    },
    async getStore(storeId) {
      const { data, error } = await client
        .from("stores")
        .select("id, name, created_by, expiry_alert_days")
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw new Error(`stores_${error.code ?? "error"}`);
      return (data as Store | null) ?? null;
    },
    async getAttentionLots(storeId) {
      const { data, error } = await client
        .from("lots_with_status")
        .select(LOT_COLUMNS)
        .eq("store_id", storeId)
        .gt("current_quantity", 0)
        .in("status", ["vencido", "por_vencer"])
        .order("expiration_date", { ascending: true })
        .order("product_name", { ascending: true });
      if (error) throw new Error(`lots_${error.code ?? "error"}`);
      return (data ?? []) as unknown as LotRow[];
    },
    async getLotsByIds(storeId, lotIds) {
      const { data, error } = await client
        .from("lots_with_status")
        .select(LOT_COLUMNS)
        .eq("store_id", storeId)
        .in("id", lotIds);
      if (error) throw new Error(`lots_${error.code ?? "error"}`);
      return (data ?? []) as unknown as LotRow[];
    },
    async saveSnapshot(batchId, snapshot) {
      return (await rpc("save_batch_snapshot", {
        p_batch_id: batchId,
        p_recipient: snapshot.recipient,
        p_subject: snapshot.subject,
        p_html: snapshot.html,
        p_text_body: snapshot.text,
      })) as boolean;
    },
    async skipItems(logIds, reason) {
      await rpc("mark_notifications_skipped", { p_ids: logIds, p_reason: reason });
    },
    async skipBatch(batchId, reason) {
      return (await rpc("skip_batch", { p_batch_id: batchId, p_reason: reason })) as boolean;
    },
    async finishSent(batchId, providerMessageId) {
      return (await rpc("finish_batch_sent", {
        p_batch_id: batchId,
        p_message_id: providerMessageId,
      })) as boolean;
    },
    async finishFailed(batchId, error) {
      return (await rpc("finish_batch_failed", { p_batch_id: batchId, p_error: error })) as boolean;
    },
  };
  const directory: Directory = {
    async getEmail(userId) {
      const { data, error } = await client.auth.admin.getUserById(userId);
      if (error) throw new Error(`auth_${error.status ?? "error"}`);
      return data.user?.email ?? null;
    },
  };

  const mailer = createResendMailer({
    apiKey: Deno.env.get("RESEND_API_KEY")!,
    from: Deno.env.get("EMAIL_FROM")!,
    apiUrl: Deno.env.get("RESEND_API_URL") || undefined,
  });

  return { db, directory, mailer, logger: console, appUrl: Deno.env.get("APP_URL")! };
}

const configProblems = () => checkConfig((name) => Deno.env.get(name));

const startupProblems = configProblems();
if (startupProblems.length > 0) {
  // Solo nombres de variables; nunca valores.
  console.error("notificaciones: configuración incompleta:", startupProblems.join(", "));
}

Deno.serve(
  createHandler({
    secret: Deno.env.get("CRON_SECRET") ?? "",
    configProblems,
    buildDeps,
  }),
);
