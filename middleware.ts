import { NextResponse, type NextRequest } from "next/server";
import { siteConfig } from "@/siteConfig";

// 这些路径不拦截（静态资源、接口、登录页本身）
const PUBLIC_PREFIXES = [
  "/login",
  "/api",
  "/_next",
  "/images",
  "/videos",
  "/music",
  "/live2d",
  "/favicon",
  "/feed",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const auth = siteConfig.auth;

  if (!auth?.enabled) return NextResponse.next();

  const cookie = request.cookies.get(auth.cookieName)?.value;
  const authed = cookie === auth.token;

  // 已登录还去登录页 → 直接回首页
  if (authed && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = pathname === "/" ? "" : `?from=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
