export default function Loading() {
  return (
    <div className="w-full min-h-[70vh] flex flex-col items-center justify-center gap-5">
      <div
        className="text-2xl md:text-3xl font-bold tracking-[0.2em] bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent"
        style={{ fontFamily: "'Noto Serif SC', serif" }}
      >
        拾光
      </div>
      <div className="text-[11px] text-slate-400 tracking-[0.3em]">正在载入你的记忆</div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-sky-400/80 animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
