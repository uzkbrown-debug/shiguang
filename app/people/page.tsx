"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, X, Sparkles, ArrowRight, Clock, MapPin } from "lucide-react";
import MemoryCard from "@/components/shiguang/MemoryCard";
import MemoryDetail from "@/components/shiguang/MemoryDetail";
import {
  buildPeople,
  buildPeopleFrom,
  sharedMemories,
  sharedMemoriesFrom,
  type ShiguangMemory,
  type ShiguangPerson,
} from "@/data/shiguang";
import { fetchMemories, fetchLocations, toShiguangMemory } from "@/app/api/shiguang";
import { useRouter } from "next/navigation";

const W = 760;
const H = 460;
const CX = W / 2;
const CY = H / 2;
const R = 165;

export default function PeoplePage() {
  const router = useRouter();
  const [remote, setRemote] = useState<{
    persons: ShiguangPerson[];
    memories: ShiguangMemory[];
    locations: { id: string; name: string }[];
  } | null>(null);

  // 人物来自后端：自动识别出来的新人物保存后就会出现在这里
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/persons").then((r) => r.json()),
      fetchMemories({ limit: 500 }),
      fetchLocations(),
    ])
      .then(([people, memoryData, locs]) => {
        if (!alive) return;
        const list =
          (people as {
            id: string;
            name: string;
            relation_label?: string | null;
            avatar?: string | null;
            via_id?: string | null;
            via_name?: string | null;
            via_label?: string | null;
          }[]) ?? [];
        if (!list.length) return;
        setRemote({
          persons: list.map((p) => ({
            id: p.id,
            name: p.name,
            relationLabel: p.relation_label ?? "",
            avatar: p.avatar ?? "",
            aliases: [],
            viaId: p.via_id ?? undefined,
            viaName: p.via_name ?? undefined,
            viaLabel: p.via_label ?? undefined,
          })),
          memories: memoryData.items.map(toShiguangMemory),
          locations: locs.items.map((l) => ({ id: l.id, name: l.name })),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const nodes = useMemo(
    () => (remote ? buildPeopleFrom(remote.persons, remote.memories, remote.locations) : buildPeople()),
    [remote],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShiguangMemory | null>(null);

  const maxShared = Math.max(...nodes.map((n) => n.sharedCount), 1);
  // 围着"我"排一圈
  const positions = nodes.map((n, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    return { node: n, x: CX + Math.cos(angle) * R, y: CY + Math.sin(angle) * R, angle };
  });

  // 间接关系的人（王盈芳的闺蜜）单独画成小卫星，挂在王盈芳外面，
  // 不占主环的位置，也不和"我"直接连线
  const anchorByName = new Map(nodes.map((n) => [n.person.name, n.person.id] as const));
  const satellites = positions
    .filter((p) => p.node.person.viaName && anchorByName.has(p.node.person.viaName))
    .map((p) => {
      const anchor = positions.find((q) => q.node.person.name === p.node.person.viaName)!;
      const angle = anchor.angle + 0.42;
      return {
        node: p.node,
        x: CX + Math.cos(angle) * (R + 66),
        y: CY + Math.sin(angle) * (R + 66),
        anchorX: anchor.x,
        anchorY: anchor.y,
      };
    });
  const mainPositions = positions.filter((p) => !satellites.some((s) => s.node.person.id === p.node.person.id));

  const active = nodes.find((n) => n.person.id === selected);
  const shared = selected
    ? remote
      ? sharedMemoriesFrom(remote.memories, selected)
      : sharedMemories(selected)
    : [];

  // 没有单独设头像时，用 TA 第一张/最近一张照片顶上，总比空圆好看
  const avatarOf = (node?: { person: { avatar?: string }; firstAt?: ShiguangMemory; lastAt?: ShiguangMemory }) => {
    if (!node) return "";
    return (
      node.person.avatar ||
      node.firstAt?.cover ||
      node.lastAt?.cover ||
      ""
    );
  };

  // 用站内自己的弹窗，别用浏览器那个丑到爆的原生 prompt
  const [editing, setEditing] = useState<{ name: string; relation: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  useEffect(() => {
    if (!editing && !confirmDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditing(null);
        setConfirmDelete(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, confirmDelete]);

  const openEdit = () => {
    if (!active) return;
    setDialogError("");
    setEditing({ name: active.person.name, relation: active.person.relationLabel ?? "" });
  };

  const saveEdit = async () => {
    if (!active || !editing) return;
    const name = editing.name.trim();
    if (!name) {
      setDialogError("名字不能为空");
      return;
    }
    setBusy(true);
    setDialogError("");
    try {
      const res = await fetch(`/api/persons/${active.person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relation_label: editing.relation.trim() }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 120));
      const updated = (await res.json()) as { name: string; relation_label: string | null };
      setRemote((prev) =>
        prev
          ? {
              ...prev,
              persons: prev.persons.map((p) =>
                p.id === active.person.id
                  ? { ...p, name: updated.name, relationLabel: updated.relation_label ?? "" }
                  : p,
              ),
            }
          : prev,
      );
      setEditing(null);
    } catch (e) {
      setDialogError((e as Error).message || "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const removePerson = async () => {
    if (!active) return;
    setBusy(true);
    setDialogError("");
    try {
      const res = await fetch(`/api/persons/${active.person.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.text()).slice(0, 120));
      setRemote((prev) =>
        prev ? { ...prev, persons: prev.persons.filter((p) => p.id !== active.person.id) } : prev,
      );
      setConfirmDelete(false);
      setSelected(null);
    } catch (e) {
      setDialogError((e as Error).message || "删除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <MemoryDetail memory={detail} onClose={() => setDetail(null)} />

      <header className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-5">
        <div className="flex items-center gap-2 md:gap-3 mb-1.5">
          <Users className="w-5 h-5 md:w-7 md:h-7 text-sky-500" />
          <h1
            className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            人物网络
          </h1>
        </div>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-7 md:ml-10">
          以共同记忆为依据 · {nodes.length} 位同行者 · 连线越粗，一起出现的次数越多
        </p>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 关系图 */}
        <div className="lg:col-span-7 glass-card rounded-3xl border-white/40 dark:border-white/10 p-3 overflow-hidden">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            <defs>
              <radialGradient id="me-glow">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={CX} cy={CY} r={R + 70} fill="url(#me-glow)" />

            {/* 连线 */}
            {mainPositions.map(({ node, x, y }, i) => {
              const strength = node.sharedCount / maxShared;
              const dim = Boolean(selected) && selected !== node.person.id;
              return (
                <motion.line
                  key={`l-${node.person.id}`}
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  stroke={selected === node.person.id ? "#38bdf8" : "#94a3b8"}
                  strokeWidth={1 + strength * 5}
                  strokeOpacity={dim ? 0.08 : 0.18 + strength * 0.35}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.1, delay: 0.1 + i * 0.03 }}
                />
              );
            })}

            {/* 卫星连线：从王盈芳连到她的闺蜜 */}
            {satellites.map(({ node, x, y, anchorX, anchorY }) => (
              <motion.line
                key={`s-${node.person.id}`}
                x1={anchorX}
                y1={anchorY}
                x2={x}
                y2={y}
                stroke={selected === node.person.id ? "#fcd34d" : "#94a3b8"}
                strokeWidth="1"
                strokeOpacity={selected && selected !== node.person.id ? 0.12 : 0.4}
                strokeDasharray="3 5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, delay: 0.5 }}
              />
            ))}

            {/* 我 */}
            <g>
              <circle cx={CX} cy={CY} r={40} fill="rgba(15,23,42,0.75)" stroke="#38bdf8" strokeWidth="1.5" />
              <text x={CX} y={CY + 5} textAnchor="middle" fill="#f1f5f9" fontSize="15" fontWeight="700">
                我
              </text>
            </g>

            {/* 主环上的人 */}
            {mainPositions.map(({ node, x, y }, i) => {
              const size = 22 + (node.sharedCount / maxShared) * 18;
              const isActive = selected === node.person.id;
              const dim = selected && !isActive;
              return (
                <g
                  key={node.person.id}
                  className="cursor-pointer"
                  opacity={dim ? 0.35 : 1}
                  onClick={() => setSelected(isActive ? null : node.person.id)}
                >
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={size}
                    fill="rgba(15,23,42,0.6)"
                    stroke={isActive ? "#fcd34d" : "rgba(255,255,255,0.35)"}
                    strokeWidth={isActive ? 2 : 1}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.15 + i * 0.05, type: "spring", stiffness: 200 }}
                  />
                  <clipPath id={`clip-${node.person.id}`}>
                    <circle cx={x} cy={y} r={size - 1} />
                  </clipPath>
                  {avatarOf(node) ? (
                    <image
                      href={avatarOf(node)}
                      x={x - size}
                      y={y - size}
                      width={size * 2}
                      height={size * 2}
                      clipPath={`url(#clip-${node.person.id})`}
                      opacity="0.9"
                      preserveAspectRatio="xMidYMid slice"
                    />
                  ) : (
                    <>
                      <circle cx={x} cy={y} r={size - 1} fill="rgba(56,189,248,0.18)" />
                      <text
                        x={x}
                        y={y + size * 0.35}
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize={size * 0.9}
                        fontWeight="700"
                      >
                        {node.person.name.slice(0, 1)}
                      </text>
                    </>
                  )}
                  <text x={x} y={y + size + 16} textAnchor="middle" className="fill-slate-700 dark:fill-slate-200" fontSize="13" fontWeight="600">
                    {node.person.name}
                  </text>
                  <text x={x} y={y + size + 30} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize="10">
                    {node.sharedCount} 段
                  </text>
                </g>
              );
            })}

            {/* 卫星：王盈芳的闺蜜这种间接关系，画得小一点、挂在她外面 */}
            {satellites.map(({ node, x, y }) => {
              const size = 15;
              const isActive = selected === node.person.id;
              const dim = selected && !isActive;
              return (
                <g
                  key={node.person.id}
                  className="cursor-pointer"
                  opacity={dim ? 0.35 : 1}
                  onClick={() => setSelected(isActive ? null : node.person.id)}
                >
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={size}
                    fill="rgba(15,23,42,0.6)"
                    stroke={isActive ? "#fcd34d" : "rgba(255,255,255,0.3)"}
                    strokeWidth={isActive ? 2 : 1}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                  />
                  <clipPath id={`clip-${node.person.id}`}>
                    <circle cx={x} cy={y} r={size - 1} />
                  </clipPath>
                  {avatarOf(node) ? (
                    <image
                      href={avatarOf(node)}
                      x={x - size}
                      y={y - size}
                      width={size * 2}
                      height={size * 2}
                      clipPath={`url(#clip-${node.person.id})`}
                      opacity="0.9"
                      preserveAspectRatio="xMidYMid slice"
                    />
                  ) : (
                    <text
                      x={x}
                      y={y + 5}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="12"
                      fontWeight="700"
                    >
                      {node.person.name.slice(0, 1)}
                    </text>
                  )}
                  <text x={x} y={y + size + 14} textAnchor="middle" className="fill-slate-700 dark:fill-slate-200" fontSize="11" fontWeight="600">
                    {node.person.name}
                  </text>
                  <text x={x} y={y + size + 26} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize="9">
                    {node.person.viaName}的{node.person.viaLabel || "关系人"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 详情 */}
        <div className="lg:col-span-5">
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key={active.person.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.3 }}
                className="glass-card rounded-3xl border-white/40 dark:border-white/10 p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/25 bg-sky-500/15 flex items-center justify-center">
                    {avatarOf(active) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarOf(active)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-sky-300">{active.person.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {active.person.name}
                      <span className="ml-2 text-[11px] font-normal text-slate-400">{active.person.relationLabel}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      共同记忆 {active.sharedCount} 段 · {active.locations.length} 个地点
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-500/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openEdit}
                    className="px-3 py-1.5 rounded-lg glass-button text-[11px] text-slate-600 dark:text-slate-200"
                  >
                    改资料
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDialogError("");
                      setConfirmDelete(true);
                    }}
                    className="px-3 py-1.5 rounded-lg glass-button text-[11px] text-rose-500"
                  >
                    从人物里删除
                  </button>
                  {!active.person.avatar && (
                    <span className="text-[10px] text-slate-400 self-center">头像自动用了 TA 的照片</span>
                  )}
                </div>

                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <Clock className="w-3.5 h-3.5 mt-0.5 text-sky-500 shrink-0" />
                    <span>
                      第一次共同记录：{active.firstAt.happenedAt.slice(0, 10)}「{active.firstAt.title}」
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <Clock className="w-3.5 h-3.5 mt-0.5 text-violet-400 shrink-0" />
                    <span>
                      最近一次共同记录：{active.lastAt.happenedAt.slice(0, 10)}「{active.lastAt.title}」
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                    <span>一起去过：{active.locations.join("、")}</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 text-sky-500 shrink-0" />
                    <span>高频主题：{active.tags.join(" · ")}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => router.push(`/timeline?person=${active.person.id}`)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 text-white text-xs hover:bg-sky-600 transition-colors"
                  >
                    查看共同记忆 <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => router.push("/stories")}
                    className="px-4 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
                  >
                    生成双人故事
                  </button>
                </div>

                <div className="mt-5">
                  <div className="text-[11px] text-slate-400 mb-2">双人时间线</div>
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {shared.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setDetail(m)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl glass-button text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.cover} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                            {m.title}
                          </span>
                          <span className="block text-[10px] text-slate-400">{m.happenedAt.slice(0, 10)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-3xl border-white/40 dark:border-white/10 p-8 text-center text-sm text-slate-400"
              >
                点击左侧任意节点，查看与 TA 的共同记忆
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-400 mt-5">
        人物身份由你确认后才会出现在网络里 · 不自动公开人脸与姓名
      </p>

      {/* 改资料 */}
      <AnimatePresence>
        {editing && active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => !busy && setEditing(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              onClick={(e) => e.stopPropagation()}
              className="sg-modal relative w-full max-w-[380px] overflow-hidden rounded-[26px] p-6"
            >
              {/* 顶部光带 */}
              <div className="sg-modal-aura pointer-events-none absolute inset-0" />

              <div className="relative">
                <div className="flex items-center gap-3.5 mb-5">
                  <div className="relative shrink-0">
                    <div className="sg-avatar-ring w-[68px] h-[68px] rounded-full overflow-hidden flex items-center justify-center bg-sky-500/15">
                      {avatarOf(active) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarOf(active)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl font-bold text-sky-300">{active.person.name.slice(0, 1)}</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold tracking-wide text-slate-800 dark:text-slate-50">
                      编辑人物资料
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      只改名字和关系 · 共同记忆 {active.sharedCount} 段不受影响
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !busy && setEditing(null)}
                    className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Users className="w-3 h-3 text-sky-500" /> 名字
                    </label>
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                      }}
                      className="sg-field w-full text-sm"
                      placeholder="如：小林"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Sparkles className="w-3 h-3 text-violet-400" /> 关系（可留空）
                    </label>
                    <input
                      value={editing.relation}
                      onChange={(e) => setEditing({ ...editing, relation: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                      }}
                      className="sg-field w-full text-sm"
                      placeholder="如：大学同学 / 女友 / 家人"
                    />
                  </div>
                </div>

                {dialogError && <p className="mt-3 text-[11px] text-rose-500">{dialogError}</p>}

                <div className="mt-6 flex justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200 disabled:opacity-60"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={saveEdit}
                    className="sg-primary px-6 py-2 rounded-xl text-white text-xs font-medium disabled:opacity-60"
                  >
                    {busy ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除确认 */}
      <AnimatePresence>
        {confirmDelete && active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => !busy && setConfirmDelete(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-white/40 dark:border-white/10 bg-white/80 dark:bg-slate-900/85 backdrop-blur-xl shadow-2xl p-5"
            >
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                从人物里删掉「{active.person.name}」？
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                只会解除 TA 和 {active.sharedCount} 段共同记忆的关联，照片和记忆本身不会被删。
                以后再提到这个名字，可以重新识别出来。
              </p>

              {dialogError && <p className="mt-3 text-[11px] text-rose-500">{dialogError}</p>}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200 disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={removePerson}
                  className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {busy ? "删除中…" : "确认删除"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
