"use client";

/** 看图找帖子：首页对话卡和小拾浮窗共用这一份，别各写一遍 */

export interface SpotHit {
  kind: "memory" | "guide" | "route";
  id: string;
  title: string;
  cover?: string | null;
  summary?: string | null;
  owner?: string | null;
  reason?: string;
  link: string;
  /** 同标题同作者的帖子被合并成一条时，这里记总条数 */
  also?: number;
}

export interface SpotResult {
  ok: boolean;
  message?: string;
  spot?: { spot: string; city: string; province: string; country?: string; confidence?: number } | null;
  province?: string;
  level?: "spot" | "city" | "province" | "none";
  hits?: SpotHit[];
  spot_hits?: number;
  city_hits?: number;
  /** 站内没有这个景点时，模型给的一段景点介绍 */
  intro?: string | null;
  /** 网上搜到并命中的景点名 */
  matched_by?: string;
}

/** 把识别结果翻译成一句人话（景点名 + 城市一起吃，不要只说"这是北京"） */
export function spotHeadline(data: SpotResult): string {
  const sp = data.spot;
  const name = sp?.spot || "";
  const city = sp?.city || "";
  const where = [name, city, sp?.province].filter(Boolean).join(" · ") || "这张照片";
  if (!data.ok) return data.message || "这张图我认不出是哪儿，换个角度或换张清楚点的试试。";
  if (data.level === "spot") {
    const more = (data.city_hits ?? 0) > 0 ? `，同城还有 ${data.city_hits} 条` : "";
    return `认出来了：${where}。站里有 ${data.spot_hits} 条正好提到这里${more}，一起给你。`;
  }
  const what = name ? `这是 ${where}。` : `这是 ${city || where}。`;
  const tail =
    data.level === "province"
      ? `站里没有这里的记录，把${data.province || sp?.province || "同省"}其它地方推给你。`
      : `站里还没有${name ? `「${name}」` : "这个景点"}的帖子，先给你同城的这几条。`;
  return what + tail;
}

/** 上传一张图 → 识别 + 站内检索 */
export async function lookupSpotByPhoto(file: File): Promise<SpotResult | null> {
  try {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch("/api/assistant/spot", { method: "POST", body: fd });
    if (!res.ok) return null;
    return (await res.json()) as SpotResult;
  } catch {
    return null;
  }
}
