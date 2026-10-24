// 写作风格（上传页与待分析列表共用）
export const STYLES = [
  { key: "travel", label: "旅行攻略", hint: "240-380 字" },
  { key: "brief", label: "简洁", hint: "80-140 字" },
  { key: "diary", label: "日记", hint: "200-320 字" },
  { key: "prose", label: "散文", hint: "320-520 字" },
  { key: "warm", label: "温暖", hint: "200-320 字" },
  { key: "humor", label: "幽默", hint: "160-280 字" },
] as const;

export const STYLE_DESC: Record<string, string> = {
  travel: "图文攻略的写法：哪座城市、怎么去、门票多少、几点人少、避坑提醒",
  brief: "只说必要信息，干脆利落",
  diary: "第一人称，像当天晚上写下的日记",
  prose: "抒情、有画面感和留白，句子长短交错",
  warm: "像在跟朋友慢慢讲这件事，语气亲切",
  humor: "轻松俏皮，可以有一点自嘲",
};

export const STYLE_KEY = "shiguang_write_style";

/** 读取上次使用的风格 */
export function loadStyle(): string {
  if (typeof window === "undefined") return "travel";
  const saved = localStorage.getItem(STYLE_KEY);
  return saved && STYLES.some((s) => s.key === saved) ? saved : "travel";
}

export function saveStyle(key: string): void {
  if (typeof window !== "undefined") localStorage.setItem(STYLE_KEY, key);
}
