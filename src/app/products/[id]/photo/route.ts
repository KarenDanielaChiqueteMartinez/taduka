import { getSessionUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/db/pool";
import { getPhoto } from "@/lib/db/photos";
import { getMembership } from "@/lib/db/stores";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

// Sirve la foto de un producto solo a usuarios con sesión y solo si pertenece a SU tienda. La URL
// lleva ?v=<versión>, así que puede cachearse (únicamente en el navegador del usuario).
export async function GET(request: Request, ctx: RouteContext<"/products/[id]/photo">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("No encontrada", { status: 404 });

  try {
    const user = await getSessionUser();
    if (!user) return new Response("No autorizado", { status: 401 });
    const membership = await getMembership(user.id);
    if (!membership) return new Response("No encontrada", { status: 404 });

    const photo = await getPhoto(membership.store.id, id);
    if (!photo || !ALLOWED.has(photo.content_type)) {
      return new Response("No encontrada", { status: 404 });
    }

    const hasVersion = new URL(request.url).searchParams.has("v");
    return new Response(new Uint8Array(photo.data), {
      headers: {
        "Content-Type": photo.content_type,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": hasVersion ? "private, max-age=31536000, immutable" : "private, no-cache",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
