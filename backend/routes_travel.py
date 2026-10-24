"""旅行路线 / 旅游攻略 / 地图共享数据接口"""
import json
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from auth import can_view, current_user, friend_ids, optional_user, visible_owner_ids
from db import get_db
import city_coords
from models import (
    GuideDay,
    GuideMedia,
    Location,
    Memory,
    MemoryMedia,
    MemoryPerson,
    MemoryVisit,
    Person,
    RoutePoint,
    TravelGuide,
    TravelRoute,
    User,
)

router = APIRouter(prefix="/api", tags=["travel"])

VIS = ("private", "friends", "public")


def _tags(raw: str | None) -> list[str]:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _vis(value: str | None, default: str = "friends") -> str:
    return value if value in VIS else default


# ---------- 「出处」怎么对上 ----------
# 地图上的点用的是地点全名（比如「伏见稻荷大社」「泰山日出」），攻略正文里往往只写
# 「伏见稻荷」「泰山」，所以先把地点拆成几个能拿去正文里找的词，按优先级排。

# 拆不出通用词的少数地点，手工给别名
PLACE_ALIAS: dict[str, list[str]] = {
    "夫子庙秦淮河": ["夫子庙", "秦淮河"],
    "埃菲尔铁塔": ["埃菲尔铁塔", "铁塔"],
    "台北 101": ["台北 101", "101"],
    "伦敦塔桥": ["伦敦塔桥", "塔桥"],
    "白云机场": ["机场"],
}

# 结尾是这些词的地点，去掉之后再找一次
_STRIP_SUFFIX = ("古城", "古镇", "草原", "云海", "日出", "大社", "公园", "长城")


def _clean_city(value: str | None) -> str:
    return re.sub(r"(市|省|区|县|自治州|地区)$", "", (value or "").strip())


def _place_tokens(loc: Location) -> list[tuple[str, bool]]:
    """一个地点能拿去攻略正文里找的词，靠前的先算数；第二个值表示「来自地点名本身」

    城市名只是兜底：先只用地点名去正文里找，一个都没找到才退到城市名，
    否则「慕田峪长城」会因为「北京路」里的「北京」两个字错认成广州那篇攻略。
    """
    name = (loc.name or "").strip()
    city = _clean_city(loc.city)
    tokens: list[tuple[str, bool]] = []
    for token in PLACE_ALIAS.get(name, []):
        tokens.append((token, True))
    if name:
        tokens.append((name, True))
    for suffix in _STRIP_SUFFIX:
        if name.endswith(suffix) and len(name) > len(suffix):
            tokens.append((name[: -len(suffix)], True))
    if city:
        tokens.append((city, False))
    out: list[tuple[str, bool]] = []
    for token, from_name in tokens:
        if len(token) >= 2 and token not in [t for t, _ in out]:
            out.append((token, from_name))
    return out


def _route_point_matches(p: RoutePoint, loc: Location) -> bool:
    """路线上的一站算不算这个地点"""
    if p.location_id and p.location_id == loc.id:
        return True
    point_name = (p.name or "").strip()
    if not point_name:
        return False
    if point_name == (loc.name or "").strip() or point_name == _clean_city(loc.city):
        return True
    return False


# ---------- 序列化 ----------

def point_dict(p: RoutePoint) -> dict:
    return {
        "id": p.id,
        "sort": p.sort,
        "name": p.name,
        "location_id": p.location_id,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "arrive_date": p.arrive_date,
        "stay_days": p.stay_days,
        "transport": p.transport,
        "note": p.note,
        "memory_id": p.memory_id,
    }


def route_brief(r: TravelRoute, owner: User | None = None) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "owner_name": owner.nickname if owner else None,
        "owner_avatar": (owner.avatar if owner else None),
        "title": r.title,
        "summary": r.summary,
        "cover": r.cover,
        "start_date": r.start_date,
        "end_date": r.end_date,
        "tags": _tags(r.tags),
        "visibility": r.visibility,
        "point_count": len(r.points),
        "days": r.points and sum(max(1, p.stay_days or 1) for p in r.points) or 0,
    }


def route_full(r: TravelRoute, owner: User | None = None) -> dict:
    data = route_brief(r, owner)
    data["points"] = [point_dict(p) for p in r.points]
    return data


def guide_brief(g: TravelGuide, owner: User | None = None) -> dict:
    return {
        "id": g.id,
        "user_id": g.user_id,
        "owner_name": owner.nickname if owner else None,
        "owner_avatar": owner.avatar if owner else None,
        "title": g.title,
        "subtitle": g.subtitle,
        "cover": g.cover,
        "destination": g.destination,
        "day_count": g.day_count,
        "budget": g.budget,
        "best_season": g.best_season,
        "summary": g.summary,
        "visibility": g.visibility,
        "status": g.status,
        "route_id": g.route_id,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "photo_count": len(g.media),
    }


def guide_full(g: TravelGuide, owner: User | None = None) -> dict:
    data = guide_brief(g, owner)
    data.update(
        {
            "transport_info": g.transport_info,
            "stay_info": g.stay_info,
            "tips": g.tips,
            "days": [
                {
                    "id": d.id,
                    "sort": d.sort,
                    "title": d.title,
                    "content": d.content,
                    "image_url": getattr(d, "image_url", None),
                    "transport": d.transport,
                    "cost": d.cost,
                }
                for d in g.days_plan
            ],
            "media": [
                {"id": m.id, "url": m.url, "caption": m.caption} for m in g.media
            ],
        }
    )
    return data


def _owner_map(db: Session, ids: set[str]) -> dict[str, User]:
    if not ids:
        return {}
    rows = db.scalars(select(User).where(User.id.in_(ids))).all()
    return {u.id: u for u in rows}


# ---------- 地图：一次拿齐「谁 · 在哪 · 走过哪条线」 ----------

@router.get("/explore")
def explore(
    scope: str = "all",
    year: str | None = None,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    owners = visible_owner_ids(db, viewer, scope)
    mems = db.scalars(
        select(Memory)
        .options(selectinload(Memory.person_links))
        .where(Memory.user_id.in_(owners) if owners else Memory.visibility == "public")
    ).all()
    if year:
        mems = [m for m in mems if (m.happened_at or "").startswith(year)]
    mems = [m for m in mems if can_view(db, viewer, m.user_id, getattr(m, "visibility", None))]

    loc_ids = {m.location_id for m in mems if m.location_id}
    locs = (
        {l.id: l for l in db.scalars(select(Location).where(Location.id.in_(loc_ids))).all()}
        if loc_ids
        else {}
    )

    points = []
    for m in mems:
        loc = locs.get(m.location_id or "")
        if not loc or not loc.latitude or not loc.longitude:
            continue
        points.append(
            {
                "memory_id": m.id,
                "owner_id": m.user_id,
                "title": m.title,
                "summary": m.summary,
                "happened_at": m.happened_at,
                "cover": m.cover,
                "media_count": m.media_count,
                "tags": _tags(m.tags),
                "visibility": getattr(m, "visibility", "friends"),
                "location_id": loc.id,
                "location_name": loc.name,
                "city": loc.city,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "person_ids": [link.person_id for link in m.person_links],
            }
        )

    routes = db.scalars(
        select(TravelRoute)
        .options(selectinload(TravelRoute.points))
        .where(TravelRoute.user_id.in_(owners) if owners else TravelRoute.visibility == "public")
    ).all()
    routes = [r for r in routes if can_view(db, viewer, r.user_id, r.visibility)]

    all_owner_ids = {p["owner_id"] for p in points} | {r.user_id for r in routes} | set(owners)
    omap = _owner_map(db, all_owner_ids)

    def owner_card(uid: str) -> dict:
        u = omap.get(uid)
        return {
            "id": uid,
            "nickname": u.nickname if u else "未知",
            "avatar": (u.avatar if u else None),
            "is_me": bool(viewer and viewer.id == uid),
            "is_friend": bool(viewer and uid in friend_ids(db, viewer.id)),
        }

    persons = {p.id: p.name for p in db.scalars(select(Person)).all()}

    # ---- 巡礼化增强：每个点的照片、出处（路线第几站 / 攻略第几天）、我的打卡状态 ----
    mem_ids = [p["memory_id"] for p in points]

    photos: dict[str, list[dict]] = {}
    if mem_ids:
        for row in db.scalars(
            select(MemoryMedia)
            .where(MemoryMedia.memory_id.in_(mem_ids))
            .order_by(MemoryMedia.memory_id, MemoryMedia.sort)
        ):
            photos.setdefault(row.memory_id, []).append(
                {
                    "url": row.url,
                    "caption": row.caption,
                    "kind": "video"
                    if row.url.lower().endswith((".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"))
                    else "image",
                }
            )

    # 路线出处：这个地点在谁的哪条路线上、第几站（一条路线只出一条）
    route_refs: dict[str, list[dict]] = {}
    for r in routes:
        hit: dict[str, int] = {}
        for idx, p in enumerate(r.points):
            for loc in locs.values():
                if loc.id in hit:
                    continue
                if _route_point_matches(p, loc):
                    hit[loc.id] = idx
        for loc_id, idx in hit.items():
            point = r.points[idx]
            route_refs.setdefault(loc_id, []).append(
                {
                    "route_id": r.id,
                    "title": r.title,
                    "stop": idx + 1,
                    "total": len(r.points),
                    "transport": point.transport,
                    "owner_name": omap[r.user_id].nickname if r.user_id in omap else None,
                    "is_mine": bool(viewer and r.user_id == viewer.id),
                }
            )

    # 攻略出处：这个地点在哪篇攻略的第几天被写到（一篇攻略只出一个最贴的那天）
    guides = db.scalars(
        select(TravelGuide)
        .options(selectinload(TravelGuide.days_plan))
        .where(TravelGuide.user_id.in_(owners) if owners else TravelGuide.visibility == "public")
    ).all()
    day_text = {
        g.id: [(d, f"{d.title or ''}{d.content or ''}") for d in g.days_plan] for g in guides
    }
    guide_refs: dict[str, list[dict]] = {}
    matched_by_name: set[str] = set()
    visible_guides = [g for g in guides if can_view(db, viewer, g.user_id, g.visibility)]
    # 两轮：先只用地点名去正文里找，一轮下来仍没对上的地点，才退到城市名兜底。
    # 这样「慕田峪长城」不会因为广州那篇里的「北京路」错认成北京，
    # 「夫子庙秦淮河」也不会因为「南京东路」错认成上海。
    for from_name in (True, False):
        for g in visible_guides:
            for loc in locs.values():
                if not loc.name or loc.id in matched_by_name:
                    continue
                best: tuple[GuideDay, str] | None = None
                for token, is_name in _place_tokens(loc):
                    if is_name is not from_name:
                        continue
                    for day, haystack in day_text[g.id]:
                        if token in haystack:
                            best = (day, token)
                            break
                    if best:
                        break
                if not best:
                    continue
                day, _token = best
                if from_name:
                    matched_by_name.add(loc.id)
                guide_refs.setdefault(loc.id, []).append(
                    {
                        "guide_id": g.id,
                        "title": g.title,
                        "day": day.sort + 1,
                        "day_title": day.title,
                        "owner_name": omap[g.user_id].nickname if g.user_id in omap else None,
                        "is_mine": bool(viewer and g.user_id == viewer.id),
                    }
                )

    # 我的打卡
    my_visits: dict[str, str] = {}
    if viewer and mem_ids:
        for v in db.scalars(
            select(MemoryVisit).where(
                MemoryVisit.user_id == viewer.id, MemoryVisit.memory_id.in_(mem_ids)
            )
        ):
            my_visits[v.memory_id] = v.state

    for p in points:
        p["photos"] = photos.get(p["memory_id"], [])
        p["route_refs"] = route_refs.get(p["location_id"], [])
        p["guide_refs"] = guide_refs.get(p["location_id"], [])
        p["visit"] = my_visits.get(p["memory_id"])
        p["person_names"] = [persons.get(pid, "") for pid in p["person_ids"] if persons.get(pid)]

    # 顶部头像条：参与过这些记忆的人物（去重，带出现次数）
    person_counter: dict[str, int] = {}
    for p in points:
        for pid in p["person_ids"]:
            person_counter[pid] = person_counter.get(pid, 0) + 1
    person_rows = {
        p.id: p for p in db.scalars(select(Person).where(Person.id.in_(list(person_counter)))).all()
    } if person_counter else {}
    person_bar = sorted(
        [
            {
                "id": pid,
                "name": person_rows[pid].name,
                "avatar": person_rows[pid].avatar,
                "count": count,
            }
            for pid, count in person_counter.items()
            if pid in person_rows
        ],
        key=lambda x: -x["count"],
    )

    return {
        "scope": scope,
        "owners": [owner_card(uid) for uid in sorted(all_owner_ids)],
        "points": points,
        "routes": [
            {
                **route_full(r, omap.get(r.user_id)),
                "owner_nickname": omap[r.user_id].nickname if r.user_id in omap else "未知",
            }
            for r in routes
        ],
        "persons": persons,
        "person_bar": person_bar,
        "visited_count": sum(1 for v in my_visits.values() if v == "visited"),
        "wish_count": sum(1 for v in my_visits.values() if v == "wish"),
        "years": sorted({(m.happened_at or "")[:4] for m in mems if m.happened_at}, reverse=True),
    }


# ---------- 记忆 → 攻略（上传完直接产出一篇攻略，记忆退到图集里） ----------

def _month_text(iso: str | None) -> str | None:
    m = re.match(r"\d{4}-(\d{2})", iso or "")
    return f"{int(m.group(1))} 月" if m else None


def _split_memory_content(memory: Memory) -> tuple[str | None, str | None, str]:
    """把「先说数 / 我的走法 / 正文」拆开：前两行进攻略摘要，其余进当天正文"""
    head = walk = None
    body: list[str] = []
    for raw in (memory.content or "").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if head is None and line.startswith("先说数"):
            head = line
        elif walk is None and line.startswith("我的走法"):
            walk = line
        else:
            body.append(line)
    return head, walk, "\n".join(body) or (memory.summary or "")


def guide_from_memory(
    db: Session,
    memory: Memory,
    user: User,
    append: bool = True,
    days: "list[ToGuideDay] | None" = None,
) -> TravelGuide:
    """把一条记忆写成攻略：同一个地点已经有攻略就往下追加一天

    append=False 用于「地点是 AI 随便猜的」那种情况 —— 猜出来的地名不该往别人
    真写过的攻略里塞一天，宁可单独开一篇。
    """
    loc = db.get(Location, memory.location_id) if memory.location_id else None
    place = (loc.name if loc else "").strip() or "路上"
    city = _clean_city(loc.city) if loc else place
    head, walk, body = _split_memory_content(memory)

    try:
        costs = json.loads(memory.cost_json or "[]")
    except Exception:
        costs = []
    total = sum(
        c.get("amount") or 0 for c in costs if isinstance(c, dict) and isinstance(c.get("amount"), (int, float))
    )

    guide = None
    if append:
        guide = db.scalar(
            select(TravelGuide)
            .options(selectinload(TravelGuide.days_plan))
            .where(TravelGuide.user_id == user.id, TravelGuide.destination == place)
            .order_by(TravelGuide.created_at.desc())
        )
    if guide is None:
        guide = TravelGuide(
            id="tg_" + uuid.uuid4().hex[:10],
            user_id=user.id,
            title=(memory.title or f"{place}的一天")[:255],
            subtitle=None,
            cover=memory.cover,
            destination=place[:128],
            day_count=0,
            budget=f"人均 ¥{int(total)}" if total else None,
            best_season=_month_text(memory.happened_at),
            transport_info=memory.transport_info,
            stay_info=memory.stay_info,
            summary="\n".join(x for x in (head, walk) if x) or memory.summary,
            tips=memory.tips,
            route_id=None,
            visibility=getattr(memory, "visibility", "friends"),
            status="published",
        )
        db.add(guide)
        db.flush()

    media_rows = list(
        db.scalars(
            select(MemoryMedia).where(MemoryMedia.memory_id == memory.id).order_by(MemoryMedia.sort)
        )
    )

    # 用户在「分天」那一步自己分的组优先；没分过才按拍摄日期兜底
    if days:
        by_url = {m.url: m for m in media_rows}
        buckets = []
        for d in days:
            rows = [by_url[u] for u in d.media_urls if u in by_url]
            buckets.append(
                {
                    "title": (d.title or "").strip() or None,
                    "content": d.content or "",
                    "transport": (d.transport or "").strip()[:64] or None,
                    "cost": (d.cost or "").strip()[:64] or None,
                    "rows": rows,
                }
            )
    else:
        dates = sorted(
            {m.captured_at[:10] for m in media_rows if m.captured_at and len(m.captured_at) >= 10}
        )
        if len(dates) >= 2:
            raw = [(d, [m for m in media_rows if (m.captured_at or "")[:10] == d]) for d in dates]
        else:
            raw = [(None, media_rows)]
        body_lines = [line for line in (body or memory.summary or "").split("\n") if line.strip()]
        chunks: list[str] = []
        if len(raw) > 1 and len(body_lines) >= len(raw):
            size = len(body_lines) // len(raw)
            for i in range(len(raw)):
                start = i * size
                end = len(body_lines) if i == len(raw) - 1 else start + size
                chunks.append("\n".join(body_lines[start:end]))
        else:
            chunks = ["\n".join(body_lines)] + [""] * (len(raw) - 1)
        buckets = [
            {
                "title": (f"（{day_date[5:]}）" if day_date else None),
                "content": chunks[i] if i < len(chunks) else "",
                "transport": None if i else ((memory.transport_info or "").strip()[:64] or None),
                "cost": None if i else (f"约 ¥{int(total)}" if total else None),
                "rows": rows,
            }
            for i, (day_date, rows) in enumerate(raw)
        ]

    day_no = len(guide.days_plan) + 1
    for offset, bucket in enumerate(buckets):
        raw_title = (bucket["title"] or "").strip() or city
        # 前端/AI 给过天标题的就直接用：攻略页左侧已经有编号，再拼「第 N 天 ·」就重了
        if days and (bucket["title"] or "").strip():
            label = raw_title
        else:
            label = raw_title if raw_title.startswith("第") else f"第 {day_no + offset} 天 · {raw_title}"
        db.add(
            GuideDay(
                id="gd_" + uuid.uuid4().hex[:10],
                guide_id=guide.id,
                sort=day_no - 1 + offset,
                title=label[:255],
                content=bucket["content"] or "",
                image_url=(bucket["rows"][0].url if bucket["rows"] else memory.cover),
                transport=bucket["transport"],
                cost=bucket["cost"],
            )
        )
    db.flush()

    # 图集：这条记忆的原图全部挂上去，同一个地址不重复加
    taken = set(db.scalars(select(GuideMedia.url).where(GuideMedia.guide_id == guide.id)))
    sort = len(taken)
    for media in media_rows:
        if media.url in taken:
            continue
        db.add(
            GuideMedia(
                guide_id=guide.id,
                url=media.url,
                caption=(media.caption or "").strip()[:255] or None,
                sort=sort,
            )
        )
        taken.add(media.url)
        sort += 1

    guide.day_count = day_no + len(buckets) - 1
    if not guide.cover:
        guide.cover = memory.cover
    if not guide.summary:
        guide.summary = "\n".join(x for x in (head, walk) if x) or memory.summary
    db.flush()
    return guide


class ToGuideDay(BaseModel):
    title: str | None = None
    content: str | None = None
    transport: str | None = None
    cost: str | None = None
    media_urls: list[str] = []


class ToGuideBody(BaseModel):
    random_place: bool = False
    days: list[ToGuideDay] | None = None


@router.post("/memories/{memory_id}/to-guide")
def memory_to_guide(
    memory_id: str,
    body: ToGuideBody | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """上传完的记忆 → 直接写成一篇攻略，返回攻略 id 让前端跳过去"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")
    if memory.user_id not in (user.id, "local"):
        raise HTTPException(403, "只能把自己的记忆写成攻略")
    memory.user_id = user.id
    random_place = bool(body.random_place) if body else False
    guide = guide_from_memory(
        db, memory, user, append=not random_place, days=(body.days if body else None)
    )
    db.commit()
    db.refresh(guide)
    return {"guide_id": guide.id, "day_count": guide.day_count}


# ---------- 坐标速查（路线编辑器用） ----------

@router.get("/geo")
def geo_lookup(q: str = Query(..., min_length=1)):
    coords = city_coords.lookup_coords(q)
    if not coords:
        raise HTTPException(404, "没查到这个地方的坐标，可以先填经纬度")
    return {"name": q, "latitude": coords[0], "longitude": coords[1]}


# ---------- 巡礼打卡 ----------

class VisitBody(BaseModel):
    memory_id: str
    state: str = "visited"  # visited 去过 / wish 想去 / none 取消


@router.post("/visits")
def set_visit(body: VisitBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    memory = db.get(Memory, body.memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")
    row = db.scalar(
        select(MemoryVisit).where(
            MemoryVisit.user_id == user.id, MemoryVisit.memory_id == body.memory_id
        )
    )
    if body.state == "none":
        if row:
            db.delete(row)
            db.commit()
        return {"memory_id": body.memory_id, "state": None}
    if body.state not in ("visited", "wish"):
        raise HTTPException(400, "只能标成 visited / wish / none")
    if row:
        row.state = body.state
    else:
        db.add(MemoryVisit(user_id=user.id, memory_id=body.memory_id, state=body.state))
    db.commit()
    return {"memory_id": body.memory_id, "state": body.state}


# ---------- 记忆可见范围 ----------

class VisibilityBody(BaseModel):
    visibility: str


@router.patch("/memories/{memory_id}/visibility")
def set_memory_visibility(
    memory_id: str,
    body: VisibilityBody,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")
    if memory.user_id not in (user.id, "local"):
        raise HTTPException(403, "只能改自己的记忆")
    memory.user_id = user.id
    memory.visibility = _vis(body.visibility)
    db.commit()
    return {"id": memory.id, "visibility": memory.visibility}


# ---------- 旅行路线 ----------

class PointBody(BaseModel):
    name: str
    latitude: float
    longitude: float
    location_id: str | None = None
    arrive_date: str | None = None
    stay_days: int = 1
    transport: str | None = None
    note: str | None = None
    memory_id: str | None = None
    sort: int | None = None


class RouteBody(BaseModel):
    title: str
    summary: str | None = None
    cover: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    tags: list[str] | None = None
    visibility: str = "friends"
    points: list[PointBody] = []


def _write_points(db: Session, route: TravelRoute, points: list[PointBody]) -> None:
    db.query(RoutePoint).filter(RoutePoint.route_id == route.id).delete(synchronize_session=False)
    for i, p in enumerate(points):
        db.add(
            RoutePoint(
                route_id=route.id,
                sort=p.sort if p.sort is not None else i,
                name=p.name.strip()[:128],
                location_id=p.location_id,
                latitude=p.latitude,
                longitude=p.longitude,
                arrive_date=p.arrive_date,
                stay_days=max(1, p.stay_days or 1),
                transport=(p.transport or "").strip()[:32] or None,
                note=(p.note or "").strip() or None,
                memory_id=p.memory_id,
            )
        )


@router.get("/routes")
def list_routes(
    scope: str = "me",
    owner: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    if owner:
        # 看某个人的主页：不是好友也能看，公开内容由 can_view 过滤
        ids = [owner]
    else:
        ids = visible_owner_ids(db, viewer, scope)
    stmt = select(TravelRoute).options(selectinload(TravelRoute.points))
    stmt = stmt.where(TravelRoute.user_id.in_(ids) if ids else TravelRoute.visibility == "public")
    rows = db.scalars(stmt.order_by(TravelRoute.start_date.desc())).all()
    rows = [r for r in rows if can_view(db, viewer, r.user_id, r.visibility)]
    if q:
        rows = [r for r in rows if q in r.title or q in (r.summary or "")]
    omap = _owner_map(db, {r.user_id for r in rows})
    return [route_full(r, omap.get(r.user_id)) for r in rows]


@router.post("/routes")
def create_route(body: RouteBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    route = TravelRoute(
        id="rt_" + uuid.uuid4().hex[:10],
        user_id=user.id,
        title=body.title.strip()[:255] or "未命名路线",
        summary=(body.summary or "").strip() or None,
        cover=body.cover or None,
        start_date=body.start_date or None,
        end_date=body.end_date or None,
        tags=json.dumps(body.tags or [], ensure_ascii=False),
        visibility=_vis(body.visibility),
    )
    db.add(route)
    db.flush()
    _write_points(db, route, body.points)
    db.commit()
    db.refresh(route)
    return route_full(route, user)


@router.get("/routes/{route_id}")
def get_route(route_id: str, db: Session = Depends(get_db), viewer: User | None = Depends(optional_user)):
    route = db.scalar(
        select(TravelRoute).options(selectinload(TravelRoute.points)).where(TravelRoute.id == route_id)
    )
    if not route:
        raise HTTPException(404, "路线不存在")
    if not can_view(db, viewer, route.user_id, route.visibility):
        raise HTTPException(403, "这条路线没有对你开放")
    return route_full(route, db.get(User, route.user_id))


@router.patch("/routes/{route_id}")
def update_route(
    route_id: str, body: RouteBody, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    route = db.scalar(
        select(TravelRoute).options(selectinload(TravelRoute.points)).where(TravelRoute.id == route_id)
    )
    if not route:
        raise HTTPException(404, "路线不存在")
    if route.user_id != user.id:
        raise HTTPException(403, "只能改自己的路线")
    route.title = body.title.strip()[:255] or route.title
    route.summary = (body.summary or "").strip() or None
    route.cover = body.cover or None
    route.start_date = body.start_date or None
    route.end_date = body.end_date or None
    route.tags = json.dumps(body.tags or [], ensure_ascii=False)
    route.visibility = _vis(body.visibility)
    _write_points(db, route, body.points)
    db.commit()
    db.refresh(route)
    return route_full(route, user)


@router.delete("/routes/{route_id}")
def delete_route(route_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    route = db.get(TravelRoute, route_id)
    if not route:
        raise HTTPException(404, "路线不存在")
    if route.user_id != user.id:
        raise HTTPException(403, "只能删自己的路线")
    db.delete(route)
    db.commit()
    return {"deleted": route_id}


# ---------- 旅游攻略 ----------

class DayBody(BaseModel):
    title: str
    content: str | None = None
    image_url: str | None = None
    transport: str | None = None
    cost: str | None = None
    sort: int | None = None


class MediaBody(BaseModel):
    url: str
    caption: str | None = None
    sort: int | None = None


class GuideBody(BaseModel):
    title: str
    subtitle: str | None = None
    cover: str | None = None
    destination: str | None = None
    budget: str | None = None
    best_season: str | None = None
    transport_info: str | None = None
    stay_info: str | None = None
    summary: str | None = None
    tips: str | None = None
    route_id: str | None = None
    visibility: str = "friends"
    status: str = "published"
    days: list[DayBody] = []
    media: list[MediaBody] = []


def _write_guide_children(db: Session, guide: TravelGuide, days: list[DayBody], media: list[MediaBody]) -> None:
    db.query(GuideDay).filter(GuideDay.guide_id == guide.id).delete(synchronize_session=False)
    db.query(GuideMedia).filter(GuideMedia.guide_id == guide.id).delete(synchronize_session=False)
    for i, d in enumerate(days):
        db.add(
            GuideDay(
                id="gd_" + uuid.uuid4().hex[:10],
                guide_id=guide.id,
                sort=d.sort if d.sort is not None else i,
                title=(d.title or f"第 {i + 1} 天").strip()[:255],
                content=(d.content or "").strip() or None,
                image_url=(d.image_url or "").strip() or None,
                transport=(d.transport or "").strip()[:64] or None,
                cost=(d.cost or "").strip()[:64] or None,
            )
        )
    for i, m in enumerate(media):
        db.add(
            GuideMedia(
                guide_id=guide.id,
                url=m.url,
                caption=(m.caption or "").strip()[:255] or None,
                sort=m.sort if m.sort is not None else i,
            )
        )


@router.get("/guides")
def list_guides(
    scope: str = "all",
    owner: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    if owner:
        # 看某个人的主页：不是好友也能看，公开内容由 can_view 过滤
        ids = [owner]
    else:
        ids = visible_owner_ids(db, viewer, scope)
    stmt = select(TravelGuide).options(selectinload(TravelGuide.media), selectinload(TravelGuide.days_plan))
    stmt = stmt.where(TravelGuide.user_id.in_(ids) if ids else TravelGuide.visibility == "public")
    rows = db.scalars(stmt.order_by(TravelGuide.created_at.desc())).all()
    rows = [g for g in rows if can_view(db, viewer, g.user_id, g.visibility)]
    if q:
        like = q.strip()
        rows = [g for g in rows if like in g.title or like in (g.destination or "") or like in (g.summary or "")]
    omap = _owner_map(db, {g.user_id for g in rows})
    return [guide_brief(g, omap.get(g.user_id)) for g in rows]


@router.post("/guides")
def create_guide(body: GuideBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    guide = TravelGuide(
        id="tg_" + uuid.uuid4().hex[:10],
        user_id=user.id,
        title=body.title.strip()[:255] or "未命名攻略",
        subtitle=(body.subtitle or "").strip()[:255] or None,
        cover=body.cover or None,
        destination=(body.destination or "").strip()[:128] or None,
        day_count=len(body.days) or 1,
        budget=(body.budget or "").strip()[:64] or None,
        best_season=(body.best_season or "").strip()[:64] or None,
        transport_info=(body.transport_info or "").strip() or None,
        stay_info=(body.stay_info or "").strip() or None,
        summary=(body.summary or "").strip() or None,
        tips=(body.tips or "").strip() or None,
        route_id=body.route_id or None,
        visibility=_vis(body.visibility),
        status=body.status if body.status in ("draft", "published") else "published",
    )
    db.add(guide)
    db.flush()
    _write_guide_children(db, guide, body.days, body.media)
    db.commit()
    db.refresh(guide)
    return guide_full(guide, user)


@router.get("/guides/{guide_id}")
def get_guide(guide_id: str, db: Session = Depends(get_db), viewer: User | None = Depends(optional_user)):
    guide = db.scalar(
        select(TravelGuide)
        .options(selectinload(TravelGuide.media), selectinload(TravelGuide.days_plan))
        .where(TravelGuide.id == guide_id)
    )
    if not guide:
        raise HTTPException(404, "攻略不存在")
    if not can_view(db, viewer, guide.user_id, guide.visibility):
        raise HTTPException(403, "这篇攻略没有对你开放")
    data = guide_full(guide, db.get(User, guide.user_id))
    if guide.route_id:
        route = db.scalar(
            select(TravelRoute)
            .options(selectinload(TravelRoute.points))
            .where(TravelRoute.id == guide.route_id)
        )
        data["route"] = route_full(route, db.get(User, route.user_id)) if route else None
    return data


@router.patch("/guides/{guide_id}")
def update_guide(
    guide_id: str, body: GuideBody, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    guide = db.scalar(
        select(TravelGuide)
        .options(selectinload(TravelGuide.media), selectinload(TravelGuide.days_plan))
        .where(TravelGuide.id == guide_id)
    )
    if not guide:
        raise HTTPException(404, "攻略不存在")
    if guide.user_id != user.id:
        raise HTTPException(403, "只能改自己的攻略")
    guide.title = body.title.strip()[:255] or guide.title
    guide.subtitle = (body.subtitle or "").strip()[:255] or None
    guide.cover = body.cover or None
    guide.destination = (body.destination or "").strip()[:128] or None
    guide.day_count = len(body.days) or guide.day_count
    guide.budget = (body.budget or "").strip()[:64] or None
    guide.best_season = (body.best_season or "").strip()[:64] or None
    guide.transport_info = (body.transport_info or "").strip() or None
    guide.stay_info = (body.stay_info or "").strip() or None
    guide.summary = (body.summary or "").strip() or None
    guide.tips = (body.tips or "").strip() or None
    guide.route_id = body.route_id or None
    guide.visibility = _vis(body.visibility)
    guide.status = body.status if body.status in ("draft", "published") else guide.status
    _write_guide_children(db, guide, body.days, body.media)
    db.commit()
    db.refresh(guide)
    return guide_full(guide, user)


@router.delete("/guides/{guide_id}")
def delete_guide(guide_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    guide = db.get(TravelGuide, guide_id)
    if not guide:
        raise HTTPException(404, "攻略不存在")
    if guide.user_id != user.id:
        raise HTTPException(403, "只能删自己的攻略")
    db.delete(guide)
    db.commit()
    return {"deleted": guide_id}


@router.get("/travel/stats")
def travel_stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """我自己的旅行概览"""
    mems = db.scalars(select(Memory).where(Memory.user_id == user.id)).all()
    cities = db.scalars(
        select(Location.city)
        .join(Memory, Memory.location_id == Location.id)
        .where(Memory.user_id == user.id, Location.city.isnot(None))
        .distinct()
    ).all()
    routes = db.scalars(select(TravelRoute).where(TravelRoute.user_id == user.id)).all()
    guides = db.scalars(select(TravelGuide).where(TravelGuide.user_id == user.id)).all()
    return {
        "memories": len(mems),
        "photos": sum(m.media_count or 0 for m in mems),
        "cities": len([c for c in cities if c]),
        "routes": len(routes),
        "guides": len(guides),
        "friends": len(friend_ids(db, user.id)),
    }
