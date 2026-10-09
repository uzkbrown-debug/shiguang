import { siteConfig } from "@/siteConfig";

const ENTRIES = [
  { title: "时间长河", desc: "把一段段记忆排成一条河", icon: "🕰️" },
  { title: "记忆地图", desc: "去过的地方，都留在这里", icon: "🗺️" },
  { title: "人物网络", desc: "从记忆里长出的一张关系网", icon: "👥" },
  { title: "故事馆", desc: "被讲述、被听见的人生片段", icon: "📖" },
  { title: "上传与解析", desc: "照片、视频、文本，自动读出时间与地点", icon: "📤" },
  { title: "小拾 AI", desc: "基于你自己的记忆库回答问题", icon: "💬" },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-10 px-6 py-20">
      <div className="text-center">
        <h1 className="text-3xl md:text-5xl font-black tracking-wider text-slate-900 dark:text-white">
          {siteConfig.title}
        </h1>
        <p className="mt-4 max-w-xl mx-auto text-sm md:text-base leading-relaxed text-slate-600 dark:text-slate-300">
          {siteConfig.bio}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
        {ENTRIES.map((e) => (
          <div
            key={e.title}
            className="rounded-2xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-800/50 backdrop-blur-md shadow-lg p-5 transition-all duration-500 hover:scale-[1.03] hover:shadow-xl"
          >
            <div className="text-2xl mb-2">{e.icon}</div>
            <div className="font-bold text-slate-900 dark:text-white">
              {e.title}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {e.desc}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 tracking-wider">
        v2 · 骨架已可运行，各功能模块逐步接入
      </p>
    </main>
  );
}
