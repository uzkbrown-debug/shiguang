"use client";

import type { ReactNode } from "react";

/**
 * 个人主页正文的极简 markdown
 *
 * 只认几种写法，够把自己那点介绍排好看就行：
 *   ## 小标题 / ### 更小的标题
 *   - 列表（连续几行算一组）
 *   1. 有序列表
 *   > 引用
 *   空行分段
 *   **加粗** 和 `行内代码`
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-slate-800 dark:text-slate-100">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="px-1 py-0.5 rounded bg-slate-500/10 text-[12px] font-mono"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + token.length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const H2 = "mt-7 text-lg md:text-xl font-extrabold text-slate-900 dark:text-white";
const H3 = "mt-6 text-base font-bold text-slate-800 dark:text-slate-100";
const BODY = "mt-3 text-[13px] leading-7 text-slate-600 dark:text-slate-300";

export default function AboutProse({ text }: { text?: string | null }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (!para.length) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key} className={BODY}>
        {inline(para.join(" "), key)}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const key = `l${blocks.length}`;
    const cls = "mt-3 pl-5 space-y-1 text-[13px] leading-7 text-slate-600 dark:text-slate-300";
    const items = list.items.map((it, i) => <li key={`${key}-${i}`}>{inline(it, `${key}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key} className={`${cls} list-decimal`}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={`${cls} list-disc`}>
          {items}
        </ul>
      ),
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const trim = line.trim();

    const heading = /^(#{2,3})\s+(.*)$/.exec(trim);
    if (heading) {
      flushPara();
      flushList();
      const key = `h${idx}`;
      blocks.push(
        heading[1].length === 2 ? (
          <h2 key={key} className={H2}>
            {inline(heading[2], key)}
          </h2>
        ) : (
          <h3 key={key} className={H3}>
            {inline(heading[2], key)}
          </h3>
        ),
      );
      return;
    }

    if (/^>\s?/.test(trim)) {
      flushPara();
      flushList();
      const key = `q${idx}`;
      blocks.push(
        <blockquote key={key} className="mt-6 border-l-2 border-indigo-400/70 pl-4">
          <p className="text-[13px] italic leading-7 text-slate-600 dark:text-slate-300">
            {inline(trim.replace(/^>\s?/, ""), key)}
          </p>
        </blockquote>,
      );
      return;
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(trim);
    if (bullet) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      return;
    }

    const ordered = /^\d+[.、]\s+(.*)$/.exec(trim);
    if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      return;
    }

    if (!trim) {
      flushPara();
      flushList();
      return;
    }

    flushList();
    para.push(trim);
  });

  flushPara();
  flushList();

  return <div className="min-w-0">{blocks}</div>;
}
