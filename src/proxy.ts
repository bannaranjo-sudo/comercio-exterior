import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Filtro optimista: solo comprueba que exista cookie de sesión.
// La validación real ocurre en el servidor (getSession / requirePermission).
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/acceso" || getSessionCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/acceso", request.url));
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
