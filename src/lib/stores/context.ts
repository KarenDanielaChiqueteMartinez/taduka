import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getMembership, type Membership, type Role } from "@/lib/db/stores";

export type { Membership, Role };

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propietario",
  staff: "Personal",
};

// Usuario autenticado y su tienda activa. La tienda sale de la membresía en la base de datos,
// nunca de datos enviados por el navegador: todo acceso a datos usa membership.store.id.
// Quien llame desde un Server Component debe ejecutar antes `await connection()` y estar
// dentro de <Suspense>.
export async function getCurrentContext() {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/login");

  let membership: Membership | null = null;
  let storeError = false;
  try {
    membership = await getMembership(user.id);
  } catch {
    storeError = true;
  }
  return { user, membership, storeError };
}
