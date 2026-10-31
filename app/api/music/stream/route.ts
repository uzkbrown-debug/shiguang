import { NextRequest, NextResponse } from "next/server";

/**
 * 音频中转：浏览器直连网易 CDN 会被 Referer/账号绑定挡掉，
 * 所以由服务端带正确的 Referer（必要时带 cookie）去取，再原样喂给浏览器。
 * 只允许网易自己的域名，避免变成开放代理。
 */
const ALLOWED = [/\.music\.126\.net$/i, /\.126\.net$/i, /\.music\.163\.com$/i, /\.163\.com$/i];

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return NextResponse.json({ error: "缺少 u 参数" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "u 不是合法地址" }, { status: 400 });
  }
  if (!ALLOWED.some((re) => re.test(target.hostname))) {
    return NextResponse.json({ error: "只允许网易的音频地址" }, { status: 403 });
  }

  const range = req.headers.get("range");
  const cookie = (process.env.NETEASE_COOKIE || "").trim();

  const upstream = await fetch(target.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Referer: "https://music.163.com/",
      Accept: "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(range ? { Range: range } : {}),
    },
    cache: "no-store",
  });

  if (!upstream.ok && upstream.status !== 206) {
    // 把上游的真实原因带出来，方便定位
    let detail = "";
    try {
      detail = (await upstream.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    console.log("[music stream] 上游", upstream.status, target.hostname, detail.slice(0, 120));
    return NextResponse.json(
      { error: `上游返回 ${upstream.status}`, host: target.hostname, detail },
      { status: 502 },
    );
  }

  const headers = new Headers();
  for (const key of ["content-type", "content-length", "accept-ranges", "content-range"]) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  headers.set("Cache-Control", "public, max-age=3600");
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
