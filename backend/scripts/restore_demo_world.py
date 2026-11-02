"""把 binlog 里捞出来的演示账号和它们的足迹/攻略/路线写回数据库（只新增，不覆盖）。

图片情况：demo_*.jpg 这些文件当初被清掉了，库里又没有它们的字节。
处理办法：文件名不在的，稳定映射到前端 public/images 里的一张图（同一个文件名永远映射到同一张），
这样世界地图上每个点都有封面可看。

用法：
    python scripts/restore_demo_world.py          # 预演
    python scripts/restore_demo_world.py --yes    # 写库
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import (  # noqa: E402
    Friendship,
    GuideDay,
    GuideMedia,
    Memory,
    MemoryMedia,
    RoutePoint,
    TravelGuide,
    TravelRoute,
    User,
)

ROOT = Path(__file__).resolve().parent.parent
RECOVERED = ROOT / "legacy_recovered"
FRONT_IMAGES = ROOT.parent / "public" / "images"
MY_ID = "usr_7a0dfb887c"

PUBLIC_IMAGES = sorted(p.name for p in FRONT_IMAGES.glob("*.webp"))


def map_url(url: str | None) -> str | None:
    """文件还在就原样用，不在了就稳定映射到一张现成的图。"""
    if not url:
        return url
    if not url.startswith("/media/uploads/"):
        return url
    name = url.split("/")[-1]
    if (UPLOAD_DIR / name).exists():
        return url
    digest = int(hashlib.md5(name.encode()).hexdigest(), 16)
    return f"/images/{PUBLIC_IMAGES[digest % len(PUBLIC_IMAGES)]}"


def payload_of(model, row: dict) -> dict:
    """挑出模型认识的列；自增整型主键一律交给数据库分配，避免和现有行撞 id。"""
    cols = model.__table__.columns
    out = {k: v for k, v in row.items() if k in cols.keys()}
    pk = cols.get("id")
    if pk is not None and getattr(pk, "autoincrement", False) and pk.type.python_type is int:
        out.pop("id", None)
    return out


def load(name: str) -> list[dict]:
    path = RECOVERED / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def main(argv: list[str]) -> int:
    apply = "--yes" in argv
    users = load("users")
    memories = [m for m in load("memories") if m.get("user_id") != MY_ID]
    media = load("memory_media")
    guides = [g for g in load("travel_guides") if g.get("user_id") != MY_ID]
    days = load("guide_days")
    gmedia = load("guide_media")
    routes = [r for r in load("travel_routes") if r.get("user_id") != MY_ID]
    points = load("route_points")
    friends = load("friendships")

    demo_ids = {u["id"] for u in users}
    memories = [m for m in memories if m.get("user_id") in demo_ids]
    mem_ids = {m["id"] for m in memories}
    media = [m for m in media if m.get("memory_id") in mem_ids]

    db = SessionLocal()
    have_users = {u.id for u in db.scalars(select(User).where(User.id.in_(demo_ids)))}
    have_mem = {m.id for m in db.scalars(select(Memory.id).where(Memory.id.in_(mem_ids)))}
    have_guide = {g.id for g in db.scalars(select(TravelGuide.id).where(TravelGuide.id.in_([x["id"] for x in guides])))}
    have_route = {r.id for r in db.scalars(select(TravelRoute.id).where(TravelRoute.id.in_([x["id"] for x in routes])))}

    print(f"演示账号 {len(users)} 个（缺 {len(users) - len(have_users)}）")
    print(f"记忆     {len(memories)} 条（缺 {len(memories) - len(have_mem)}）")
    print(f"媒体     {len(media)} 条 · 攻略 {len(guides)} 篇 · 行程 {len(days)} 天 · 攻略图 {len(gmedia)} 张")
    print(f"路线     {len(routes)} 条 · 站点 {len(points)} 个 · 好友关系 {len(friends)} 条")
    mapped = sum(1 for m in media if map_url(m.get("url")) != m.get("url"))
    print(f"其中 {mapped} 张图片文件已丢，会映射到 public/images 里的现成图")

    if not apply:
        print("\n预演结束，加 --yes 才会写库。")
        return 0

    # 1) 账号
    for u in users:
        if u["id"] in have_users:
            continue
        payload = payload_of(User, u)
        db.add(User(**payload))

    # 先把账号落库：friendships / memories 都靠外键指过来
    db.flush()

    # 2) 好友关系
    for f in friends:
        if f.get("friend_user_id") not in demo_ids:
            continue
        exists = db.scalar(
            select(Friendship).where(
                Friendship.user_id == f["user_id"], Friendship.friend_user_id == f["friend_user_id"]
            )
        )
        if exists:
            continue
        payload = payload_of(Friendship, f)
        db.add(Friendship(**payload))

    db.flush()

    # 3) 路线 + 站点
    for r in routes:
        if r["id"] in have_route:
            continue
        payload = payload_of(TravelRoute, r)
        db.add(TravelRoute(**payload))
    db.flush()
    route_ids = {r["id"] for r in routes}
    for p in points:
        if p.get("route_id") not in route_ids:
            continue
        if db.scalar(select(RoutePoint).where(RoutePoint.id == p.get("id"))):
            continue
        payload = payload_of(RoutePoint, p)
        payload["memory_id"] = payload.get("memory_id") if payload.get("memory_id") in mem_ids else None
        db.add(RoutePoint(**payload))

    # 4) 攻略 + 分天 + 图
    for g in guides:
        if g["id"] in have_guide:
            continue
        payload = payload_of(TravelGuide, g)
        payload["cover"] = map_url(payload.get("cover"))
        db.add(TravelGuide(**payload))
    db.flush()
    guide_ids = {g["id"] for g in guides}
    for d in days:
        if d.get("guide_id") not in guide_ids:
            continue
        if db.scalar(select(GuideDay).where(GuideDay.id == d.get("id"))):
            continue
        payload = payload_of(GuideDay, d)
        if "image_url" in payload:
            payload["image_url"] = map_url(payload["image_url"])
        db.add(GuideDay(**payload))
    for gm in gmedia:
        if gm.get("guide_id") not in guide_ids:
            continue
        payload = payload_of(GuideMedia, gm)
        if "url" in payload:
            payload["url"] = map_url(payload["url"])
        db.add(GuideMedia(**payload))

    # 5) 记忆 + 媒体
    for m in memories:
        if m["id"] in have_mem:
            continue
        payload = payload_of(Memory, m)
        payload["cover"] = map_url(payload.get("cover"))
        db.add(Memory(**payload))
    db.flush()
    for md in media:
        payload = payload_of(MemoryMedia, md)
        payload["url"] = map_url(payload.get("url"))
        db.add(MemoryMedia(**payload))

    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        print("写库失败，已回滚：", exc)
        return 1
    print("恢复完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
