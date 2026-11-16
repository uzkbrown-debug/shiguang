/**
 * 注册表单的输入规则
 *
 * 两件事：
 * 1) 城市只能是城市名 —— 数字、符号在输入时就打不进去，提交前再校验一次；
 * 2) 账号是纯数字，提供一个「随机」按钮，生成不超过十位的数字账号。
 */

/** 城市：只留汉字、字母、空格和间隔号，其余（数字、标点、表情）全部过滤 */
export function sanitizeCity(raw: string): string {
  return (raw || "")
    .replace(/[0-9０-９]/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z·\s]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 12);
}

/** 提交前校验：留空放行；否则必须是 2~12 位汉字/字母组成的名字 */
export function cityProblem(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/[0-9０-９]/.test(v)) return "常驻城市只能填城市名，不能有数字";
  if (v.length < 2) return "城市名至少两个字，比如 上海";
  if (!/^[\u4e00-\u9fa5a-zA-Z·\s]+$/.test(v)) return "城市名只填汉字或字母，比如 上海 / 杭州";
  return "";
}

/** 随机数字账号：首位非 0，默认 8 位（不超过十位） */
export function randomAccount(len = 8): string {
  const n = Math.min(Math.max(Math.round(len), 3), 10);
  let out = String(Math.floor(Math.random() * 9) + 1);
  while (out.length < n) out += String(Math.floor(Math.random() * 10));
  return out;
}
