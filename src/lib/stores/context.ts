import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Membership = {
  role: "owner" | "staff";
  stores: { id: string; name: string; expiry_alert_days: number } | null;
};

export const ROLE_LABELS: Record<Membership["role"], string> = {
  owner: "Propietario",
  staff: "Personal",
};

// Usuario autenticado y su tienda activa. La tienda sale de la membresía (RLS),
// nunca de datos enviados por el navegador. Quien llame desde un Server Component
// debe ejecutar antes `await connection()` y estar dentro de <Suspense>.
export async function getCurrentContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const { data: memberships, error: storeError } = await supabase
    .from("store_members")
    .select("role, stores(id, name, expiry_alert_days)")
    .order("created_at", { ascending: true })
    .limit(1);

  const membership = (memberships?.[0] ?? null) as Membership | null;
  return { supabase, user: data.user, membership, storeError };
}
