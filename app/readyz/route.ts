// 就绪探针：不经过 next.config 的 /api/* 代理，所以后端还没起来时
// 不会往控制台刷 "Failed to proxy ... ECONNREFUSED"。
// 开场动画和会话体检都先问这里，通了再去调 /api/*。

export const dynamic = "force-dynamic";

const BACKEND = "http://127.0.0.1:8000/api/health";

export async function GET() {
  try {
    const res = await fetch(BACKEND, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = (await res.json()) as { status?: string };
      return Response.json({ ready: data.status === "ok" });
    }
  } catch {
    /* 后端还没起来，属于正常情况 */
  }
  return Response.json({ ready: false });
}
