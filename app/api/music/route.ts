import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import Meting from "@meting/core";

interface SongData {
  id: string;
  title: string;
  artist: string;
  cover: string;
  src: string;
  lrcUrl: string;
}

// 支持的在线音乐平台（@meting/core 内置）
const ONLINE_SERVERS = ["netease", "tencent", "kugou", "kuwo", "baidu"] as const;

/**
 * 本地音乐：把音频文件放进 public/music/ 即可
 * 文件名格式建议： 歌名 - 歌手.mp3
 * 可选同名歌词：   歌名 - 歌手.lrc
 * 可选同名封面：   歌名 - 歌手.jpg / .png / .webp
 */
function localTracks(): SongData[] {
  const dir = path.join(process.cwd(), "public", "music");
  if (!fs.existsSync(dir)) return [];

  const audioRe = /\.(mp3|m4a|flac|wav|ogg|aac)$/i;
  const coverRe = /\.(jpg|jpeg|png|webp|avif)$/i;
  const files = fs.readdirSync(dir).filter((f) => audioRe.test(f));

  return files.map((file, i) => {
    const base = file.replace(/\.[^.]+$/, "");
    const [rawTitle, rawArtist] = base.split(/\s*-\s*/);
    const coverFile = fs
      .readdirSync(dir)
      .find((f) => coverRe.test(f) && f.replace(/\.[^.]+$/, "") === base);
    const lrcFile = `${base}.lrc`;

    return {
      id: `local-${i + 1}`,
      title: (rawTitle || base).trim(),
      artist: (rawArtist || "本地音乐").trim(),
      cover: coverFile ? `/music/${encodeURIComponent(coverFile)}` : "",
      src: `/music/${encodeURIComponent(file)}`,
      lrcUrl: fs.existsSync(path.join(dir, lrcFile)) ? `/music/${encodeURIComponent(lrcFile)}` : "",
    };
  });
}


/**
 * 带会员 cookie 向网易要播放地址。
 * Meting 默认拿到的是 30 秒试听；官方这两个接口在有会员时会给完整音源。
 * 返回的地址**原样使用**（网易给的是 http，浏览器能取；改成 https 反而可能被拒）。
 */
/** 优先读 backend/data/netease_cookie.txt（.env 里的长值在 Next 里读出来是空的） */
async function readCookie(): Promise<string> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), "backend", "data", "netease_cookie.txt");
    const text = (await fs.readFile(file, "utf8")).trim();
    if (text) return text;
  } catch {
    /* 文件不存在就走 env */
  }
  return (process.env.NETEASE_COOKIE || "").trim();
}

async function memberUrl(trackId: string | number): Promise<string> {
  const cookie = await readCookie();
  if (!cookie) return "";

  const endpoints = [
    `https://music.163.com/api/song/enhance/player/url/v1?ids=${encodeURIComponent(`[${trackId}]`)}&level=exhigh&encodeType=mp3`,
    `https://music.163.com/api/song/enhance/player/url?ids=${encodeURIComponent(`[${trackId}]`)}&br=320000`,
  ];

  const notes: string[] = [];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Referer: "https://music.163.com/",
          Accept: "*/*",
          Cookie: cookie,
        },
        cache: "no-store",
      });
      const text = await res.text();
      const data = JSON.parse(text) as { data?: { url?: string | null; size?: number; freeTrialInfo?: unknown }[] };
      const first = (data.data || [])[0];
      const got = first?.url || "";
      notes.push(`cookie=${cookie.length} ${new URL(url).pathname} status=${res.status} size=${first?.size ?? 0} trial=${first?.freeTrialInfo ? "yes" : "no"} url=${got.slice(0, 48)}`);
      if (got) {
        await appendDebug(notes.join("\n"));
        return got;
      }
    } catch (err) {
      notes.push(`${url.slice(0, 60)} 异常 ${(err as Error).message}`);
    }
  }
  await appendDebug(notes.join("\n"));
  return "";
}

/** 把取流过程记到后端目录，方便排查（不影响播放） */
async function appendDebug(line: string) {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "backend", "data");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "music_debug.log"), `[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch {
    /* 日志失败无所谓 */
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("server") || "";
  const server = (requested || "netease").toLowerCase();
  const playlistId = searchParams.get("id");
  const songIds = searchParams.get("ids");

  // 本地音乐模式：不依赖任何外部接口
  if (server === "local") {
    return NextResponse.json(localTracks());
  }

  if (!playlistId && !songIds) {
    return NextResponse.json(
      { error: "需要提供 id (歌单ID) 或 ids (歌曲ID,逗号分隔)" },
      { status: 400 }
    );
  }

  const plat = (ONLINE_SERVERS as readonly string[]).includes(server) ? server : "netease";
  const meting = new Meting(plat);
  meting.format(true);

  // 可选：账号 Cookie（只从服务端环境变量读取，不会打包给浏览器）
  // 配置后可以拿到会员音质 / 完整版音源；不配置就用默认（未登录，只能试听）
  const cookieByPlatform: Record<string, string | undefined> = {
    netease: process.env.NETEASE_COOKIE,
    tencent: process.env.TENCENT_COOKIE,
    kugou: process.env.KUGOU_COOKIE,
    kuwo: process.env.KUWO_COOKIE,
  };
  const accountCookie = cookieByPlatform[plat] || process.env.MUSIC_COOKIE;
  if (accountCookie && accountCookie.trim()) {
    // @meting/core 的官方类型里没声明 cookie 方法，但运行时支持
    (meting as unknown as { cookie: (c: string) => void }).cookie(accountCookie.trim());
  }

  try {
    let tracks: { id: string; name: string; artist: string[]; pic_id: string; url_id: string; lyric_id: string }[] = [];

    // 歌单（取不到就跳过，不影响追加的单曲）
    if (playlistId) {
      try {
        const raw = await meting.playlist(playlistId);
        const parsed = JSON.parse(raw as string);
        tracks = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error("playlist fetch failed:", err);
      }
    }

    // 追加的单曲（与歌单合并去重）
    if (songIds) {
      const ids = songIds.split(",").map((s) => s.trim()).filter(Boolean);
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const raw = await meting.song(id);
            const parsed = JSON.parse(raw as string);
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            return [];
          }
        })
      );
      const seen = new Set(tracks.map((t) => String(t.id)));
      for (const extra of results.flat()) {
        const key = String(extra.id);
        if (!seen.has(key)) {
          seen.add(key);
          tracks.push(extra);
        }
      }
    }

    // 批量获取 URL
    const songs: SongData[] = await Promise.all(
      tracks.map(async (track) => {
        let src = "";
        try {
          const urlRaw = await meting.url(track.url_id, 320);
          const urlData = JSON.parse(urlRaw as string);
          const full = await memberUrl(track.url_id);
          src = full || (urlData.url || "").replace(/^http:\/\//, "https://");
        } catch {
          // ignore
        }

        let cover = "";
        try {
          const picRaw = await meting.pic(track.pic_id, 300);
          const picData = JSON.parse(picRaw as string);
          cover = (picData.url || "").replace(/^http:\/\//, "https://");
        } catch {
          // ignore
        }

        return {
          id: String(track.id),
          title: track.name || "未知歌曲",
          artist: Array.isArray(track.artist) ? track.artist.join(", ") : String(track.artist || "未知歌手"),
          cover,
          src,
          lrcUrl: track.lyric_id
            ? `https://api.injahow.cn/meting/?server=${plat}&type=lrc&id=${track.lyric_id}`
            : "",
        };
      })
    );

    return NextResponse.json(songs.filter((s) => s.src));
  } catch (err) {
    console.error("Meting error:", err);
    return NextResponse.json(
      { error: "获取音乐数据失败" },
      { status: 500 }
    );
  }
}
