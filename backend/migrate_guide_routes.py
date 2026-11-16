"""把「有攻略、没路线」的旧数据接上（可重复执行）

背景：上传完直接写攻略时，guide.route_id 一直是 None，攻略页不显示路线、
地图和旅行页也看不到这条线。新写入逻辑已在 routes_travel.link_guide_route 修好，
这个脚本补齐历史数据。

原则：只用「这篇攻略的作者自己拍过的记忆」来定位，绝不去别人的数据里借坐标。
作者自己的记忆里也找不到地名时，才退回城市坐标（内置表 / 高德），找不到就跳过。

用法：cd backend && python migrate_guide_routes.py
"""

import json
import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

import city_coords
from db import SessionLocal
from models import Location, Memory, RoutePoint, TravelGuide, TravelRoute


def _clean(value: str | None) -> str:
    text = (value or "").strip()
    for suffix in ("市", "省"):
        if text.endswith(suffix) and len(text) > len(suffix) + 1:
            text = text[: -len(suffix)]
    return text


def own_memories(db, user_id: str) -> list[tuple[Memory, Location]]:
    rows = db.execute(
        select(Memory, Location)
        .join(Location, Location.id == Memory.location_id)
        .where(Memory.user_id == user_id)
        .order_by(Memory.happened_at)
    ).all()
    return [(m, l) for m, l in rows if l.latitude is not None and l.longitude is not None]


def pick_seats(mine, place: str) -> list[tuple[Memory, Location]]:
    """作者自己的记忆里，跟这篇攻略对得上的那几条（地点名相等 / 互相包含）"""
    if not place:
        return []
    hits = [
        (m, l)
        for m, l in mine
        if (l.name or "").strip() == place
        or place in (l.name or "")
        or (l.name or "") in place
        or _clean(l.city) == _clean(place)
    ]
    # 去重：同一个地点只留最早的一条
    out, seen = [], set()
    for m, l in hits:
        key = l.id or (l.name or "")
        if key in seen:
            continue
        seen.add(key)
        out.append((m, l))
    return out


def main() -> None:
    db = SessionLocal()
    made = linked = skipped = 0
    cache: dict[str, list[tuple[Memory, Location]]] = {}
    try:
        guides = list(
            db.scalars(
                select(TravelGuide)
                .options(selectinload(TravelGuide.days_plan))
                .where(TravelGuide.route_id.is_(None))
                .order_by(TravelGuide.created_at)
            )
        )
        for guide in guides:
            place = (guide.destination or "").strip() or (guide.title or "").strip()
            mine = cache.setdefault(guide.user_id, own_memories(db, guide.user_id))
            seats = pick_seats(mine, place)

            coords = None
            city_name = ""
            if seats:
                city_name = _clean(seats[0][1].city) or ""
            else:
                coords = city_coords.lookup_coords(place)
                if not coords:
                    skipped += 1
                    print(f"[跳过] {guide.title[:24]}（作者没有这里的记忆，也查不到坐标）")
                    continue
                city_name = _clean(place)

            dates = sorted((m.happened_at or "")[:10] for m, _ in seats if m.happened_at)
            start = dates[0] if dates else None
            end = dates[-1] if dates else None
            label = city_name or place

            route = TravelRoute(
                id="rt_" + uuid.uuid4().hex[:10],
                user_id=guide.user_id,
                title=(label if (guide.day_count or 1) <= 1 else f"{label} {guide.day_count} 天")[:255],
                summary=(guide.summary or "").strip()[:300] or None,
                cover=guide.cover,
                start_date=start,
                end_date=end,
                tags=json.dumps([label] if label else [], ensure_ascii=False),
                visibility=guide.visibility or "friends",
            )
            db.add(route)
            db.flush()

            if seats:
                for i, (mem, loc) in enumerate(seats):
                    db.add(
                        RoutePoint(
                            route_id=route.id,
                            sort=i,
                            name=((loc.name or place) or "路上")[:128],
                            location_id=loc.id,
                            latitude=loc.latitude,
                            longitude=loc.longitude,
                            arrive_date=(mem.happened_at or "")[:10] or None,
                            stay_days=1,
                            memory_id=mem.id,
                        )
                    )
            else:
                db.add(
                    RoutePoint(
                        route_id=route.id,
                        sort=0,
                        name=place[:128],
                        latitude=coords[0],
                        longitude=coords[1],
                        arrive_date=None,
                        stay_days=1,
                    )
                )

            guide.route_id = route.id
            made += 1
            linked += 1
            print(f"[接上] {guide.title[:26]} → {route.title}（{len(seats) or 1} 个点）")

        db.commit()
        left = len(list(db.scalars(select(TravelGuide).where(TravelGuide.route_id.is_(None)))))
        total = len(list(db.scalars(select(TravelRoute.id))))
        print(f"\n新建路线 {made} 条，接上攻略 {linked} 篇，跳过 {skipped} 篇；路线总数 {total}，仍未关联 {left} 篇")
    finally:
        db.close()


if __name__ == "__main__":
    main()
