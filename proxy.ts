import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { authCookieOptions, authStorageKey, isSessionCookie } from "@/lib/supabase/cookies";
import { readAdminSessionContext, sessionErrorKind } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";

const publicAdminRoutes = new Set([
  "/admin/login", "/admin/forgot-password", "/admin/reset-password", "/admin/access-denied",
]);

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function missingProduct() {
  return new NextResponse('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Product not found | AvenFurniture</title></head><body style="font-family:Arial,sans-serif;color:#26231e;background:#faf8f4;margin:0;padding:12vh 7vw"><a href="/">AvenFurniture</a><main><h1>Piece not found</h1><p>This piece is no longer available in the public catalog.</p><a href="/products">Browse products</a></main></body></html>', { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } });
}

export async function proxy(request: NextRequest) {
  const productMatch = /^\/products\/([^/]+)$/.exec(request.nextUrl.pathname);
  if (productMatch) {
    const { url, publishableKey } = getSupabaseConfig();
    let slug: string;
    try { slug = decodeURIComponent(productMatch[1]); } catch { return missingProduct(); }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return missingProduct();
    const read = async (table: string, query: URLSearchParams) => {
      const response = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: publishableKey }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Catalog lookup failed.");
      return response.json();
    };
    try {
      const product = await read("products", new URLSearchParams({ select: "id,categories!inner(active)", slug: `eq.${slug}`, status: "eq.published", "categories.active": "eq.true", limit: "1" }));
      if (product.length) return NextResponse.next();
      const redirects = await read("slug_redirects", new URLSearchParams({ select: "products!inner(slug,status,categories!inner(active))", old_slug: `eq.${slug}`, "products.status": "eq.published", "products.categories.active": "eq.true", limit: "1" }));
      if (redirects[0]?.products?.slug) return NextResponse.redirect(new URL(`/products/${redirects[0].products.slug}`, request.url), 308);
      return missingProduct();
    } catch { return new NextResponse("Catalog is temporarily unavailable.", { status: 503, headers: { "Retry-After": "5" } }); }
  }
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();
  const originalCookies = request.cookies.getAll();
  const storageKey = authStorageKey(url);
  const pathname = request.nextUrl.pathname;
  const api = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const protectedRoute = api || ((pathname === "/admin" || pathname.startsWith("/admin/")) && !publicAdminRoutes.has(pathname));
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = response;
        response = NextResponse.next({ request });
        previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const unavailable = () => {
    // Fresh response intentionally discards queued cookie mutations: network
    // errors are not evidence that the user's refresh token is invalid.
    console.warn(JSON.stringify({ event: "auth_unavailable", status: 503 }));
    const failure = api
      ? NextResponse.json({ error: "Authentication temporarily unavailable. Please retry." }, { status: 503 })
      : new NextResponse("Authentication temporarily unavailable. Please reload and try again.", { status: 503 });
    failure.headers.set("Retry-After", "5");
    return privateResponse(failure);
  };
  const invalid = () => {
    // Remove only this project's session; never destroy unrelated cookies or
    // the recovery/PKCE verifier. Invalid cookies must not reach page/actions.
    const names = new Set([...originalCookies, ...response.cookies.getAll()].map(({ name }) => name));
    for (const name of names) if (isSessionCookie(name, storageKey)) request.cookies.delete(name);
    if (protectedRoute) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/admin/login";
      destination.search = "";
      response = api ? NextResponse.json({ error: "Authentication required." }, { status: 401 }) : NextResponse.redirect(destination);
    } else {
      response = NextResponse.next({ request });
    }
    for (const name of names) if (isSessionCookie(name, storageKey)) response.cookies.set(name, "", { ...authCookieOptions, maxAge: 0 });
    return privateResponse(response);
  };

  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) return sessionErrorKind(error) === "invalid" ? invalid() : unavailable();
    if (!data?.claims) return invalid();
    if (protectedRoute && !(await readAdminSessionContext(supabase))) return invalid();
  } catch (error) {
    return sessionErrorKind(error) === "invalid" ? invalid() : unavailable();
  }
  // Every action/DAL call repeats the authorization check; proxy is not the
  // security boundary. SQL RLS protects direct PostgREST requests too.
  return privateResponse(response);
}

export const config = { matcher: ["/admin/:path*", "/auth/:path*", "/api/admin/:path*", "/products/:slug"] };
