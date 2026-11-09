"""小拾 AI：基于 MySQL 里的真实记忆回答问题（DeepSeek + 简单检索）"""
import re
from urllib.parse import quote

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

import llm
import spot_guide
from auth import can_view, optional_user
from db import get_db
from models import GuideDay, Location, Memory, MemoryPerson, MemoryVisit, Person, TravelGuide, User

router = APIRouter(prefix="/api", tags=["小拾 AI"])

_STOPWORDS = {
    "什么", "怎么", "哪些", "哪个", "什么时候", "有没有", "我的", "你的", "帮我", "请问",
    "可以", "能不能", "告诉", "关于", "有关", "一下", "这个", "那个", "他们", "我们",
}


class QuestionIn(BaseModel):
    question: str
    # 最近几轮问答，只用来消解指代（「那次」「那里」「他」）
    history: list[dict] = []


def _keywords(question: str) -> list[str]:
    """从问题里抽关键词：中文 2-4 字滑窗 + 英文/数字词"""
    words: set[str] = set()

    for token in re.findall(r"[A-Za-z0-9]{2,}", question):
        words.add(token.lower())

    chinese = re.sub(r"[^\u4e00-\u9fa5]+", " ", question)
    for chunk in chinese.split():
        for size in (4, 3, 2):
            for i in range(len(chunk) - size + 1):
                word = chunk[i : i + size]
                if word in _STOPWORDS:
                    continue
                words.add(word)

    return [w for w in words if w not in _STOPWORDS]


def _pick_relevant(question: str, db: Session, user_id: str | None = None, limit: int = 10) -> list[dict]:
    """关键词打分挑出最相关的记忆；没命中就给最近的几条（这样寒暄类问题也有上下文）

    user_id 给定时只在这个人自己的记忆里检索 —— 否则会把别人的旅程当成「你去过」，
    「我去过厦门吗」就永远答不出「你没去过」。没登录就没有可依据的个人记忆。
    """
    if not user_id:
        return []

    rows = db.scalars(
        select(Memory)
        .where(Memory.user_id == user_id)
        .order_by(Memory.happened_at.desc())
        .limit(200)
    ).all()
    keywords = _keywords(question)

    person_names = {
        p.id: p.name for p in db.scalars(select(Person))
    }
    location_names = {
        loc.id: loc.name for loc in db.scalars(select(Location))
    }
    person_links: dict[str, list[str]] = {}
    for link in db.scalars(select(MemoryPerson)):
        person_links.setdefault(link.memory_id, []).append(link.person_id)

    scored: list[tuple[int, Memory, dict]] = []
    for memory in rows:
        people = [person_names.get(pid, "") for pid in person_links.get(memory.id, [])]
        place = location_names.get(memory.location_id or "", "")
        haystack = " ".join(
            filter(
                None,
                [
                    memory.title,
                    memory.summary,
                    memory.content,
                    memory.tags,
                    memory.emotion,
                    memory.happened_at,
                    place,
                    " ".join(people),
                ],
            )
        ).lower()

        score = sum(1 for kw in keywords if kw.lower() in haystack)
        payload = {
            "id": memory.id,
            "date": (memory.happened_at or "")[:10],
            "title": memory.title,
            "summary": memory.summary,
            "place": place or None,
            "people": [p for p in people if p and p != "我"],
            "tags": re.findall(r'"([^"]+)"', memory.tags or ""),
            "emotion": memory.emotion,
        }
        scored.append((score, memory, payload))

    hits = [item for item in scored if item[0] > 0]
    hits.sort(key=lambda x: (-x[0], x[1].happened_at or ""), reverse=False)
    chosen = hits[:limit]
    if not chosen:
        chosen = scored[:limit]

    return [payload for _, _, payload in chosen]


# ---------- 「我去过没」：先核对自己的记忆，再翻别人的足迹 ----------

_PLACE_SUFFIX_RE = re.compile(r"(市|省|自治区|特别行政区|地区|盟|县|区)$")
_PLACES_Q_RE = re.compile(
    r"(去过|到过|走过|打卡过).{0,8}(哪些|几个|哪几|哪里|什么地方|什么城市)"
    r"|哪些(地方|城市|国家)"
    r"|都去过哪"
)

# 数据里有些地点把自己写成了城市（「鼓浪屿」的 city 也填「鼓浪屿」），
# 这里补一层归属，问厦门时鼓浪屿也算进去，问鼓浪屿也认得出厦门那几条。
CITY_MERGE = {
    "鼓浪屿": "厦门",
}


def _city_key(value: str | None) -> str:
    return _PLACE_SUFFIX_RE.sub("", (value or "").strip())


def _loc_key(loc: Location) -> str:
    """这个地点算在哪个城市名下（「厦门市」和「厦门」是同一个）"""
    key = _city_key(loc.city) or _city_key(loc.name) or (loc.name or "")
    return CITY_MERGE.get(key, key)


def _detect_place(question: str, db: Session) -> Location | None:
    """问题里点到的地点/城市

    地点名命中比城市名命中更值钱：「我去过厦门吗」不该被一条 city=厦门 的
    「鼓浪屿」记录抢走，问「鼓浪屿」时又要能选中鼓浪屿本人。
    """
    best: tuple[int, Location] | None = None
    for loc in db.scalars(select(Location)):
        name = (loc.name or "").strip()
        city = _city_key(loc.city)
        score = 0
        if len(name) >= 2 and name in question:
            score = 100 + len(name)
        elif len(city) >= 2 and city in question:
            score = len(city)
        if score and (best is None or score > best[0]):
            best = (score, loc)
    return best[1] if best else None


def _city_scope(db: Session, loc: Location) -> set[str]:
    """同城所有地点 id：问厦门时含鼓浪屿，问鼓浪屿时也认得出那两条记录"""
    key = _loc_key(loc)
    name = _city_key(loc.name)
    ids = {loc.id}
    for other in db.scalars(select(Location)):
        if other.id in ids:
            continue
        if _loc_key(other) == key or (name and _city_key(other.name) == name):
            ids.add(other.id)
    return ids


def _others_in_place(
    db: Session, viewer: User | None, scope: set[str], key: str, limit: int = 8
) -> tuple[list[dict], int]:
    """这个地方还有谁去过：记忆 + 攻略，合并成一张人卡（优先给能点开的攻略）

    返回 (能看的人, 存在但看不到的人数)。看不到的人只计数、不露名字 ——
    「名字可见、内容按 visibility」这条规则不能靠猜。
    """
    if not scope:
        return [], 0

    cards: dict[str, dict] = {}
    hidden: set[str] = set()

    def card_for(uid: str) -> dict:
        return cards.setdefault(
            uid,
            {
                "userId": uid,
                "name": None,
                "avatar": None,
                "count": 0,
                "lastVisit": None,
                "memoryId": None,
                "title": None,
                "cover": None,
                "guideId": None,
                "guideTitle": None,
            },
        )

    for memory in db.scalars(
        select(Memory).where(Memory.location_id.in_(scope)).order_by(Memory.happened_at.desc())
    ):
        if viewer and memory.user_id == viewer.id:
            continue
        if not can_view(db, viewer, memory.user_id, memory.visibility):
            hidden.add(memory.user_id)
            continue
        card = card_for(memory.user_id)
        card["count"] += 1
        date = (memory.happened_at or "")[:10]
        if date and (card["lastVisit"] is None or date > card["lastVisit"]):
            card["lastVisit"] = date
        if card["memoryId"] is None:
            card["memoryId"] = memory.id
            card["title"] = memory.title
            card["cover"] = memory.cover

    for guide in db.scalars(select(TravelGuide)):
        if viewer and guide.user_id == viewer.id:
            continue
        if key and key not in (guide.destination or "") and key not in (guide.title or ""):
            continue
        if not can_view(db, viewer, guide.user_id, guide.visibility):
            hidden.add(guide.user_id)
            continue
        card = card_for(guide.user_id)
        if card["guideId"] is None:
            card["guideId"] = guide.id
            card["guideTitle"] = guide.title

    if not cards:
        return [], len(hidden)

    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(list(cards))))}
    out: list[dict] = []
    for uid, card in cards.items():
        user = users.get(uid)
        card["name"] = user.nickname if user else "有人"
        card["avatar"] = user.avatar if user else None
        out.append(card)

    # 有攻略的排前面，其次按去过的次数
    out.sort(key=lambda c: (c["guideId"] is None, -(c["count"] or 0)))
    return out[:limit], len(hidden)


def _place_check(db: Session, viewer: User | None, loc: Location) -> dict:
    """某个地方：我去过没有、去过几次、谁去过"""
    all_locs = list(db.scalars(select(Location)))
    scope = _city_scope(db, loc)
    key = _loc_key(loc)

    mine: list[Memory] = []
    if viewer:
        mine = [
            m
            for m in db.scalars(
                select(Memory).where(Memory.user_id == viewer.id).order_by(Memory.happened_at)
            )
            if (m.location_id or "") in scope
        ]

    # 问的是城市（厦门）→ 全城都算；问的是具体地点（鼓浪屿）→ 先只算它自己，
    # 一条都没有才退到「这个城市里还算去过别的地方」。
    is_city = _city_key(loc.name) == key
    exact_ids = {o.id for o in all_locs if _city_key(o.name) == _city_key(loc.name)} | {loc.id}
    exact = [m for m in mine if (m.location_id or "") in exact_ids]
    hits = mine if is_city else (exact or mine)

    check = {
        "place": loc.name,
        "city": key,
        "locationId": loc.id,
        # city = 问的是城市（厦门），place = 问的是具体地点（鼓浪屿）
        "level": "city" if is_city else "place",
        "visited": bool(hits),
        "visitCount": len(hits),
        "cityVisitCount": len(mine),
        "firstVisit": (hits[0].happened_at or "")[:10] if hits else None,
        "lastVisit": (hits[-1].happened_at or "")[:10] if hits else None,
        "checkIn": None,
        "wish": False,
        "memoryIds": [m.id for m in hits][:5],
        "others": [],
        "hiddenOthers": 0,
    }

    # 巡礼打卡：给这个城市里的点标过「去过 / 想去」
    if viewer:
        rows = db.execute(
            select(MemoryVisit, Memory)
            .join(Memory, Memory.id == MemoryVisit.memory_id)
            .where(MemoryVisit.user_id == viewer.id)
        ).all()
        for visit, memory in rows:
            if (memory.location_id or "") not in scope:
                continue
            if visit.state == "visited":
                check["checkIn"] = "visited"
                check["visited"] = True
            elif visit.state == "wish" and check["checkIn"] is None:
                check["checkIn"] = "wish"
                check["wish"] = True

    others, hidden = _others_in_place(db, viewer, scope, key)
    check["others"] = others
    check["hiddenOthers"] = hidden
    # 命中的这几条记忆就是「你去过」的全部依据 —— 回答只能引用它们，
    # 否则会出现「说去过新加坡、证据却是同一天在伦敦那条」这种自相矛盾。
    loc_names = {l.id: l.name for l in all_locs}
    check["evidence"] = [
        {
            "id": m.id,
            "title": m.title,
            "date": (m.happened_at or "")[:10],
            "place": loc_names.get(m.location_id or ""),
        }
        for m in hits[:3]
    ]
    # 前端要一个能直接看全的入口：地图页按关键词过滤，所以传地名
    check["mapHref"] = "/map?q=" + quote(key or loc.name or "")
    return check


def _my_places(db: Session, viewer: User | None) -> list[dict]:
    """我去过哪些地方：按城市聚合，最近去过的排前面"""
    if not viewer:
        return []

    locs = {l.id: l for l in db.scalars(select(Location))}
    agg: dict[str, dict] = {}
    for memory in db.scalars(
        select(Memory).where(Memory.user_id == viewer.id).order_by(Memory.happened_at)
    ):
        loc = locs.get(memory.location_id or "")
        if loc is None:
            continue
        key = _loc_key(loc)
        if not key:
            continue
        item = agg.setdefault(
            key,
            {
                "city": key,
                "name": loc.name,
                "locationId": loc.id,
                "count": 0,
                "first": None,
                "last": None,
            },
        )
        item["count"] += 1
        date = (memory.happened_at or "")[:10]
        if date:
            item["first"] = date if not item["first"] else min(item["first"], date)
            item["last"] = date if not item["last"] else max(item["last"], date)

    items = list(agg.values())
    items.sort(key=lambda x: (x["last"] or "", x["count"]), reverse=True)
    return items


def _place_hint(check: dict | None, places: list[dict] | None) -> str | None:
    """把地点核查结果写成给模型的硬提示，回答里必须点明去过 / 没去过"""
    if check:
        name = check["place"]
        others = [o for o in check.get("others") or [] if o.get("name")]
        if check["visited"]:
            bits = [f"「{name}」他自己的记忆里有 {check['visitCount']} 段记录"]
            if check["firstVisit"]:
                bits.append(f"最早 {check['firstVisit']}")
            if check["lastVisit"]:
                bits.append(f"最近 {check['lastVisit']}")
            text = "，".join(bits) + "。回答里必须明确说「你去过」，不要说成「没有记录」。"
            refs = [
                f"《{e['title']}》（{e['date']}，{e['place'] or name}）"
                for e in check.get("evidence") or []
            ]
            if refs:
                text += (
                    " 能拿来当证据的只有这几条：" + "、".join(refs) + "。"
                    "只能用它们，绝对不要用别的城市/别的日期的记忆来凑——那会前后矛盾。"
                )
            if others:
                text += " 另外 " + "、".join(o["name"] for o in others[:3]) + " 也去过，被问到再展开。"
            return "【地点核查】" + text

        text = f"「{name}」在他的记忆里一条都没有，也就是他没去过。第一句就要说清楚「你没去过」或者「你的记忆里还没有{name}」。"
        if others:
            listing = "、".join(
                f"{o['name']}（{o.get('guideTitle') or o.get('title') or '有记录'}）" for o in others[:3]
            )
            text += f" 去过的人有：{listing}。可以说一句「不过这些人都去过」，并建议看他们的攻略。"
        else:
            text += " 也没有查到别人去过，可以直接给建议。"
        return "【地点核查】" + text

    if places:
        top = "、".join(f"{p['city']}（{p['count']} 段）" for p in places[:6])
        rest = f" 一共 {len(places)} 个地方。" if len(places) > 6 else ""
        return f"【地点核查】他去过的地方（按最近去过排）：{top}。{rest}按这个列表说，不要编造列表外的城市。"
    return None


def _guide_map(db: Session, memory_ids: list[str]) -> dict[str, str]:
    """证据记忆 → 它落在哪篇攻略里（和地图页「攻略出处」用的是同一套地名匹配）

    前端拿这个 map 把「证据记忆」方块做成传送门：点一下直接跳 /travel/{guide_id}。
    匹配不到的记忆不进 map，前端自己退到 /memories/{memory_id}。
    """
    if not memory_ids:
        return {}

    # 延迟导入，避免和 routes_travel 形成模块级循环依赖
    from routes_travel import _place_tokens

    mems = {m.id: m for m in db.scalars(select(Memory).where(Memory.id.in_(memory_ids)))}
    loc_ids = {m.location_id for m in mems.values() if m.location_id}
    if not loc_ids:
        return {}

    locs = {l.id: l for l in db.scalars(select(Location).where(Location.id.in_(loc_ids)))}
    guides = db.scalars(select(TravelGuide).options(selectinload(TravelGuide.days_plan))).all()
    if not guides:
        return {}

    # 分三档：目的地/标题 > 概括段落 > 每天正文。
    # 强档优先，是因为「漳州一日」这种攻略的副标题会写「厦门往返刚好」，
    # 只在正文里认字会把厦门记忆错送过去。
    tiers: list[dict[str, str]] = []
    for g in guides:
        days = " ".join(f"{d.title or ''}{d.content or ''}" for d in g.days_plan)
        tiers.append(
            {
                "id": g.id,
                "strong": " ".join(p for p in [g.title, g.destination] if p),
                "mid": " ".join(
                    p
                    for p in [g.subtitle, g.summary, g.tips, g.transport_info, g.stay_info]
                    if p
                ),
                "weak": days,
            }
        )

    out: dict[str, str] = {}
    for memory_id, memory in mems.items():
        loc = locs.get(memory.location_id or "")
        if loc is None:
            continue
        # 先用地点名找，找不到才退到城市名兜底（同 explore 的两轮策略）
        hit: str | None = None
        for from_name in (True, False):
            for token, is_name in _place_tokens(loc):
                if is_name is not from_name:
                    continue
                for tier in ("strong", "mid", "weak"):
                    hit = next((idx["id"] for idx in tiers if token in idx[tier]), None)
                    if hit:
                        break
                if hit:
                    break
            if hit:
                break
        if hit:
            out[memory_id] = hit

    return out


def _evidence_cards(db: Session, memory_ids: list[str], guides: dict[str, str]) -> list[dict]:
    """证据记忆的展示信息由后端给：前端不再依赖本地演示数据也能显示标题、日期、封面"""
    if not memory_ids:
        return []

    rows = {m.id: m for m in db.scalars(select(Memory).where(Memory.id.in_(memory_ids)))}
    places = {l.id: l.name for l in db.scalars(select(Location))}
    persons = {p.id: p.name for p in db.scalars(select(Person))}
    links: dict[str, list[str]] = {}
    for link in db.scalars(
        select(MemoryPerson).where(MemoryPerson.memory_id.in_(memory_ids))
    ):
        links.setdefault(link.memory_id, []).append(link.person_id)

    out: list[dict] = []
    # 同一天 + 同一个地点，本质是同一趟事：只留信息最全的那一条，
    # 别把一次天安门夜景拆成三块重复卡片
    picked: dict[tuple[str, str], dict] = {}
    order: list[tuple[str, str]] = []

    def score(card: dict) -> tuple:
        return (
            1 if card.get("cover") else 0,
            len(card.get("tags") or []),
            len(card.get("people") or []),
            1 if card.get("guideId") else 0,
        )

    for memory_id in memory_ids:
        memory = rows.get(memory_id)
        if memory is None:
            continue
        people = [persons.get(pid, "") for pid in links.get(memory.id, [])]
        card = {
            "id": memory.id,
            "title": memory.title,
            "date": (memory.happened_at or "")[:10],
            "cover": memory.cover,
            "place": places.get(memory.location_id or ""),
            # 「出处感」：谁在场、打了什么标签、什么情绪
            "people": [p for p in people if p and p != "我"],
            "tags": re.findall(r'"([^"]+)"', memory.tags or "")[:3],
            "emotion": memory.emotion,
            "guideId": guides.get(memory.id),
        }
        key = ((memory.happened_at or "")[:10], memory.location_id or f"t:{memory.title or ''}")
        if key not in picked:
            picked[key] = card
            order.append(key)
        elif score(card) > score(picked[key]):
            picked[key] = card

    out = [picked[key] for key in order]

    # 同一天里「天安门」和「北京天安门广场」是同一处：归一化后互相包含就并成一条
    def norm_place(text: str) -> str:
        s = (text or "").strip()
        for suf in ("广场", "景区", "风景区", "公园", "步行街", "一带"):
            s = s.replace(suf, "")
        return s

    merged: list[dict] = []
    for card in out:
        spot = None
        a = norm_place(card.get("place") or card.get("title") or "")
        for kept in merged:
            if kept.get("date") != card.get("date"):
                continue
            b = norm_place(kept.get("place") or kept.get("title") or "")
            if a and b and (a in b or b in a):
                spot = kept
                break
        if spot is None:
            merged.append(card)
        elif score(card) > score(spot):
            merged[merged.index(spot)] = card
    return merged


@router.post("/assistant/query")
def assistant_query(
    payload: QuestionIn,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(400, "问题不能为空")

    # 先做地点核查：问的是某个地方 → 我到底去过没、谁去过；
    # 问的是「我去过哪些地方」→ 把我的足迹按城市列出来。
    # 核查失败也不该把整个问答拖垮：出错就当作「没有地点信息」继续答。
    history = [
        {"role": str(t.get("role") or "user"), "text": str(t.get("text") or "")[:500]}
        for t in (payload.history or [])[-6:]
        if str(t.get("text") or "").strip()
    ]
    history_text = " ".join(t["text"] for t in history)
    # 检索用「本轮问题 + 上文的用户提问 + 上一条回答的开头」：
    # 「那次是和谁去的」本身没有关键词，必须借上文才检索得到记忆。
    last_reply = next((t["text"] for t in reversed(history) if t["role"] == "ai"), "")
    search_text = " ".join(
        part
        for part in (question, " ".join(t["text"] for t in history if t["role"] == "user"), last_reply[:120])
        if part
    )

    place_check = None
    places = None
    try:
        # 本轮没提到地名时，用上文最近提到的地点兜底（「那次是几月」要沿用厦门）
        place = _detect_place(question, db) or (_detect_place(history_text, db) if history_text else None)
        place_check = _place_check(db, viewer, place) if place else None
        if viewer and place is None and _PLACES_Q_RE.search(question):
            places = _my_places(db, viewer)
    except Exception as exc:  # noqa: BLE001
        print("[assistant] 地点核查失败:", exc)
    hint = _place_hint(place_check, places)

    memories = _pick_relevant(search_text, db, viewer.id if viewer else None)
    result = llm.answer_memory_question(question, memories, hint, history)

    if not result:
        # 未配置 Key 或调用失败 → 让前端回退到本地规则匹配
        return {
            "answer": None,
            "evidenceMemoryIds": [],
            "evidenceGuideIds": {},
            "evidenceCards": [],
            "placeCheck": place_check,
            "places": places,
            "fallback": True,
            "memoryCount": len(memories),
        }

    # 证据必须落在地点核查命中的那几条里：模型有时会拿同一天的其它城市记忆来凑，
    # 于是出现「说去过新加坡、证据是伦敦」的自相矛盾。这里兜死。
    evidence = list(result["evidence"])
    if place_check and place_check.get("memoryIds"):
        allowed = set(place_check["memoryIds"])
        kept = [eid for eid in evidence if eid in allowed]
        evidence = kept or place_check["memoryIds"][:3]

    guide_map = _guide_map(db, evidence)
    return {
        "answer": result["answer"],
        "evidenceMemoryIds": evidence,
        "evidenceGuideIds": guide_map,
        "evidenceCards": _evidence_cards(db, evidence, guide_map),
        "placeCheck": place_check,
        "places": places,
        "model": result["model"],
        "matchedMemories": len(memories),
        "fallback": False,
    }


class PlaceIn(BaseModel):
    question: str = ""


@router.post("/assistant/place")
def assistant_place(
    payload: PlaceIn,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """只做地点核查（不调模型）：给「我去过没 / 谁去过」的徽章和小卡片用"""
    try:
        place = _detect_place(payload.question or "", db)
        return {
            "placeCheck": _place_check(db, viewer, place) if place else None,
            "places": _my_places(db, viewer) if viewer and not place else None,
        }
    except Exception as exc:  # noqa: BLE001
        print("[assistant] place 接口失败:", exc)
        return {"placeCheck": None, "places": None}


class GuideMapIn(BaseModel):
    memoryIds: list[str] = []


@router.post("/assistant/guide-map")
def assistant_guide_map(payload: GuideMapIn, db: Session = Depends(get_db)):
    """只查「证据记忆 → 攻略 id」，不调模型。

    前端走本地规则降级时（没配 Key / 模型超时）也能把证据方块做成传送门。
    """
    try:
        return {"guideIds": _guide_map(db, payload.memoryIds[:10])}
    except Exception as exc:  # noqa: BLE001
        print("[assistant] guide-map 失败:", exc)
        return {"guideIds": {}}


# ---------- 看图找帖子：识别景点 → 站内推荐 ----------

@router.post("/assistant/spot")
async def assistant_spot(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """传一张旅游照片：认出景点，再把站内相关帖子推给用户。

    优先级：同景点（+ 同城其它）→ 同城 → 省内其它城市 → 没有就直说。
    """
    if not image.filename:
        raise HTTPException(400, "没有收到图片")
    suffix = Path(image.filename).suffix.lower() or ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp"}:
        raise HTTPException(400, "这个格式看不了，换 jpg/png 试试")

    tmp_dir = Path(tempfile.mkdtemp(prefix="spot_"))
    tmp_path = tmp_dir / f"upload{suffix}"
    try:
        with tmp_path.open("wb") as fh:
            shutil.copyfileobj(image.file, fh)
        if tmp_path.stat().st_size > 12 * 1024 * 1024:
            raise HTTPException(413, "图片太大了，压到 12MB 以内")

        spot_info = llm.identify_spot(tmp_path)
        if not spot_info:
            return {
                "ok": False,
                "reason": "llm" if llm.available() else "no-key",
                "message": "这张图我认不出是哪儿，换个角度或换张清楚点的试试。",
                "spot": None,
                "hits": [],
            }

        city = spot_info.get("city", "") or ""
        province = spot_info.get("province", "") or ""

        # ① 先按模型直接给的景点找站内帖子
        result = spot_guide.find_posts(db, viewer, spot_info.get("spot", ""), city, province)
        source = "model"

        # ② 模型没认出景点：拿候选地名 + 画面关键词去网上搜一圈，把景点名抠出来再找
        if result["level"] == "none" or not result["hits"]:
            names: list[str] = []
            for cand in spot_info.get("candidates") or []:
                if cand and cand not in names:
                    names.append(cand)
            try:
                import websearch

                for title in websearch.guess_spots(spot_info.get("keywords") or [], city):
                    if title not in names:
                        names.append(title)
            except Exception as exc:  # 网络搜索失败不影响主流程
                print("[spot] websearch skip:", exc)

            for name in names[:12]:
                hit = spot_guide.find_posts(db, viewer, name, city, province)
                if hit["hits"]:
                    hit["matched_by"] = name
                    result, source = hit, "web"
                    break

        # 站内没有这个景点的帖子时，至少把景点本身讲清楚（不能只说"这是北京"）
        intro = None
        spot_name = spot_info.get("spot") or ""
        if result.get("level") != "spot" and spot_name:
            intro = llm.describe_spot(spot_name, city, province)

        return {
            "ok": True,
            "spot": spot_info,
            "province": spot_guide.province_of(city, province) or province,
            "source": source,
            "intro": intro,
            **result,
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
