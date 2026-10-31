import { NextResponse, type NextRequest } from "next/server";
import { siteConfig } from "@/siteConfig";

// 这些路径不拦截（静态资源、接口、登录页本身）
const PUBLIC_PREFIXES = [
  "/login",
  "/api",
  "/readyz",
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
  // 现在每个账号一个会话令牌，这里只判断「有没有登录过」；
  // 令牌是否还有效由页面里的 SessionGuard 调 /api/auth/me 确认，
  // 所以这里不能把 /login 直接弹回首页 —— 否则过期 cookie 会两头弹成死循环。
  const authed = Boolean(cookie && cookie.length > 10);

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
