import { NextResponse, type NextRequest } from "next/server";
import { hashToken, SESSION_COOKIE } from "@/lib/auth/tokens";
import { findSessionUser } from "@/lib/db/users";

const AUTH_ROUTES = ["/login", "/register"];
const PROTECTED_ROUTES = ["/dashboard", "/products", "/categories", "/lots", "/activity", "/more"];

function matches(pathname: string, routes: string[]) {
  return routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

// Primera barrera de acceso. Sin cookie de sesión no se entra a las rutas privadas. Con cookie,
// cada página valida la sesión contra la base (una cookie falsa o vencida redirige a /login),
// así que esta comprobación solo evita trabajo y da una redirección rápida.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (matches(pathname, PROTECTED_ROUTES) && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Quien ya tiene una sesión válida no necesita ver el login ni el registro.
  if (matches(pathname, AUTH_ROUTES) && token && token.length <= 128) {
    try {
      if (await findSessionUser(hashToken(token))) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      // Si la base no responde, se muestra el login normalmente.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Excluye archivos estáticos, optimización de imágenes y recursos públicos.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
