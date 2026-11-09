"""看图找帖子：识别出景点 → 先在站内找同景点的帖子，没有就退到同城、再退到同省其它城市。

只推当前用户看得见的内容（自己 / 好友 / 公开），和站内其它地方的规则保持一致。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from auth import can_view
from models import Location, Memory, MemoryMedia, TravelGuide, TravelRoute, User

# 城市 → 省/地区。库里 locations.region 半空，没填的用这张表兜底
CITY_PROVINCE: dict[str, str] = {
    # 福建
    "厦门": "福建省", "福州": "福建省", "泉州": "福建省", "漳州": "福建省", "武夷山": "福建省",
    # 云南
    "昆明": "云南省", "大理": "云南省", "丽江": "云南省", "香格里拉": "云南省", "腾冲": "云南省",
    "西双版纳": "云南省", "泸沽湖": "云南省",
    # 四川
    "成都": "四川省", "成都市": "四川省", "乐山": "四川省", "九寨沟": "四川省", "稻城": "四川省",
    "康定": "四川省", "都江堰": "四川省", "峨眉山": "四川省",
    # 重庆
    "重庆": "重庆市", "重庆市": "重庆市",
    # 浙江
    "杭州": "浙江省", "宁波": "浙江省", "绍兴": "浙江省", "乌镇": "浙江省", "嘉兴": "浙江省",
    "舟山": "浙江省", "温州": "浙江省", "丽水": "浙江省", "千岛湖": "浙江省",
    # 江苏
    "南京": "江苏省", "苏州": "江苏省", "无锡": "江苏省", "扬州": "江苏省", "常州": "江苏省",
    "镇江": "江苏省", "周庄": "江苏省",
    # 上海 / 北京 / 天津
    "上海": "上海市", "北京": "北京市", "天津": "天津市",
    # 陕西
    "西安": "陕西省", "西安市": "陕西省", "延安": "陕西省", "华山": "陕西省", "咸阳": "陕西省",
    # 江西
    "南昌": "江西省", "南昌市": "江西省", "景德镇": "江西省", "九江": "江西省", "婺源": "江西省",
    "上饶": "江西省", "庐山": "江西省",
    # 广西
    "桂林": "广西", "阳朔": "广西", "南宁": "广西", "北海": "广西", "柳州": "广西",
    # 广东
    "广州": "广东省", "深圳": "广东省", "珠海": "广东省", "汕头": "广东省", "潮州": "广东省",
    # 湖南
    "长沙": "湖南省", "张家界": "湖南省", "凤凰": "湖南省", "衡阳": "湖南省",
    # 湖北
    "武汉": "湖北省", "宜昌": "湖北省", "恩施": "湖北省", "十堰": "湖北省",
    # 河南 / 河北 / 山西 / 山东
    "郑州": "河南省", "洛阳": "河南省", "开封": "河南省",
    "石家庄": "河北省", "承德": "河北省", "秦皇岛": "河北省",
    "太原": "山西省", "大同": "山西省", "平遥": "山西省",
    "青岛": "山东省", "济南": "山东省", "青岛三日": "山东省", "泰安": "山东省", "威海": "山东省",
    "烟台": "山东省", "曲阜": "山东省",
    # 甘肃 / 青海 / 新疆 / 西藏 / 宁夏 / 内蒙
    "兰州": "甘肃省", "敦煌": "甘肃省", "张掖": "甘肃省", "嘉峪关": "甘肃省",
    "西宁": "青海省", "青海湖": "青海省",
    "乌鲁木齐": "新疆", "喀什": "新疆", "伊犁": "新疆",
    "拉萨": "西藏", "林芝": "西藏", "日喀则": "西藏",
    "银川": "宁夏", "呼和浩特": "内蒙古", "海拉尔": "内蒙古", "满洲里": "内蒙古",
    # 东北
    "哈尔滨": "黑龙江省", "漠河": "黑龙江省", "长春": "吉林省", "延吉": "吉林省",
    "沈阳": "辽宁省", "大连": "辽宁省",
    # 海南 / 贵州 / 安徽 / 港澳台
    "三亚": "海南省", "海口": "海南省", "万宁": "海南省",
    "贵阳": "贵州省", "黔东南": "贵州省", "荔波": "贵州省",
    "合肥": "安徽省", "黄山": "安徽省", "宏村": "安徽省", "芜湖": "安徽省",
    "香港": "香港", "澳门": "澳门", "台北": "台湾", "高雄": "台湾", "台中": "台湾",
    # 国外（按国家当"省"用，够用了）
    "东京": "日本", "大阪": "日本", "京都": "日本", "奈良": "日本", "札幌": "日本",
    "首尔": "韩国", "釜山": "韩国", "曼谷": "泰国", "清迈": "泰国", "普吉": "泰国",
    "新加坡": "新加坡", "吉隆坡": "马来西亚", "巴厘岛": "印度尼西亚",
    "巴黎": "法国", "罗马": "意大利", "伦敦": "英国", "纽约": "美国", "旧金山": "美国",
}


def province_of(*names: str | None) -> str | None:
    """从一串地名里推出省份：先查表，查不到就原样返回带「省/市/自治区」的那个"""
    for name in names:
        if not name:
            continue
        key = name.strip()
        if not key:
            continue
        for candidate in (key, key.removesuffix("市"), key.removesuffix("省")):
            hit = CITY_PROVINCE.get(candidate)
            if hit:
                return hit
        if any(key.endswith(suffix) for suffix in ("省", "自治区", "特别行政区")) or key in ("北京", "上海", "天津", "重庆"):
            return key
    return None


def _owner_name(db: Session, user_id: str | None) -> str | None:
    if not user_id:
        return None
    user = db.get(User, user_id)
    return (user.nickname or user.username) if user else None


def _brief(kind: str, row, owner: str | None, reason: str, extra: dict | None = None) -> dict:
    item = {
        "kind": kind,
        "id": row.id,
        "title": getattr(row, "title", "") or "未命名",
        "cover": getattr(row, "cover", None),
        "summary": getattr(row, "summary", None),
        "owner": owner,
        "reason": reason,
        "link": (
            f"/memories/{row.id}"
            if kind == "memory"
            else f"/travel/{row.id}"
            if kind == "guide"
            else f"/travel/route/{row.id}"
        ),
    }
    if extra:
        item.update(extra)
    return item


def _haystack(*parts: str | None) -> str:
    return " ".join(p for p in parts if p)


SPOT_SUFFIX_RE = __import__("re").compile(
    r"(广场|景区|风景区|风景名胜区|国家森林公园|森林公园|地质公园|博物院|博物馆|古镇|古城|古村|公园|长城)$"
)


def _spot_tokens(spot: str) -> list[str]:
    """「天安门广场」→ [天安门广场, 天安门]，「八达岭长城景区」→ [八达岭长城景区, 八达岭长城]"""
    tokens = [spot]
    stripped = SPOT_SUFFIX_RE.sub("", spot)
    if stripped and stripped != spot and len(stripped) >= 2:
        tokens.append(stripped)
    return tokens


def _match_spot(db: Session, viewer, spot: str) -> list[dict]:
    """站内提到这个景点的帖子"""
    out: list[dict] = []

    # 记忆：地点名或正文里有这个景点
    rows = db.scalars(
        select(Memory).options(selectinload(Memory.person_links)).where(Memory.location_id.isnot(None))
    ).all()
    locs = {l.id: l for l in db.scalars(select(Location)).all()}
    for m in rows:
        loc = locs.get(m.location_id or "")
        loc_name = (loc.name or "") if loc else ""
        text = _haystack(loc_name, m.title, m.summary, m.content)
        # 双向包含 + 去后缀的核：「天安门广场」也能对上库里的「天安门」
        hit = bool(spot) and any(
            token and (token in text or (loc_name and loc_name in token))
            for token in _spot_tokens(spot)
        )
        if hit and can_view(db, viewer, m.user_id, getattr(m, "visibility", None)):
            out.append(_brief("memory", m, _owner_name(db, m.user_id), f"提到「{spot}」"))

    # 攻略：标题/摘要/正文/每天内容
    for g in db.scalars(
        select(TravelGuide).options(selectinload(TravelGuide.days_plan), selectinload(TravelGuide.media))
    ).all():
        text = _haystack(g.title, g.summary, g.destination, g.tips)
        if not spot or spot not in text:
            continue
        if can_view(db, viewer, g.user_id, g.visibility):
            out.append(_brief("guide", g, _owner_name(db, g.user_id), f"提到「{spot}」"))

    # 路线：标题/摘要/站点名
    for r in db.scalars(select(TravelRoute).options(selectinload(TravelRoute.points))).all():
        text = _haystack(r.title, r.summary, " ".join(p.name or "" for p in r.points))
        if spot and spot in text and can_view(db, viewer, r.user_id, r.visibility):
            out.append(_brief("route", r, _owner_name(db, r.user_id), f"提到「{spot}」"))
    return out


def _match_city(db: Session, viewer, city: str) -> list[dict]:
    """同一个城市的其它帖子"""
    out: list[dict] = []
    locs = {l.id: l for l in db.scalars(select(Location)).all()}

    def same_city(name: str | None) -> bool:
        if not name:
            return False
        n = name.strip()
        return n == city or n.startswith(city) or city.startswith(n)

    for m in db.scalars(select(Memory).options(selectinload(Memory.person_links))).all():
        loc = locs.get(m.location_id or "")
        if not loc:
            continue
        if not (same_city(loc.city) or same_city(loc.name)):
            continue
        if can_view(db, viewer, m.user_id, getattr(m, "visibility", None)):
            out.append(_brief("memory", m, _owner_name(db, m.user_id), f"{city}的另一个地方"))

    for g in db.scalars(select(TravelGuide).options(selectinload(TravelGuide.media))).all():
        text = _haystack(g.destination, g.title, g.summary)
        if same_city(g.destination) or city in text:
            if can_view(db, viewer, g.user_id, g.visibility):
                out.append(_brief("guide", g, _owner_name(db, g.user_id), f"就在{city}"))

    for r in db.scalars(select(TravelRoute).options(selectinload(TravelRoute.points))).all():
        names = [p.name or "" for p in r.points]
        text = _haystack(r.title, r.summary, " ".join(names))
        if city in text or any(city in n or n in city for n in names if n):
            if can_view(db, viewer, r.user_id, r.visibility):
                out.append(_brief("route", r, _owner_name(db, r.user_id), f"路过{city}"))
    return out


def _match_province(db: Session, viewer, province: str, exclude_city: str | None) -> list[dict]:
    """同省其它城市：站里没有这个城市的内容时，退一步给省内的"""
    out: list[dict] = []
    locs = {l.id: l for l in db.scalars(select(Location)).all()}

    def in_province(loc: Location | None) -> bool:
        if not loc:
            return False
        prov = loc.region or province_of(loc.city, loc.name)
        if not prov:
            return False
        norm = lambda x: x.replace("省", "").replace("市", "").replace("自治区", "")
        if norm(prov) != norm(province):
            return False
        if exclude_city:
            city_name = loc.city or loc.name or ""
            if city_name == exclude_city or city_name.startswith(exclude_city):
                return False
        return True

    for m in db.scalars(select(Memory)).all():
        loc = locs.get(m.location_id or "")
        if in_province(loc) and can_view(db, viewer, m.user_id, getattr(m, "visibility", None)):
            out.append(
                _brief("memory", m, _owner_name(db, m.user_id), f"{province} · {loc.city or loc.name}")
            )

    for g in db.scalars(select(TravelGuide).options(selectinload(TravelGuide.media))).all():
        prov = province_of(g.destination, g.title)
        if prov and prov.replace("省", "") == province.replace("省", ""):
            if exclude_city and g.destination and exclude_city in g.destination:
                continue
            if can_view(db, viewer, g.user_id, g.visibility):
                out.append(_brief("guide", g, _owner_name(db, g.user_id), f"{province}的其它地方"))
    return out


TOP_N = 3


def _pick_top(items: list[dict], limit: int = TOP_N) -> list[dict]:
    """最多给三条：先保证类型不重样（记忆/攻略/路线各一条），不够再按原顺序补"""
    picked: list[dict] = []
    kinds: set[str] = set()
    for item in items:
        if len(picked) >= limit:
            break
        if item["kind"] not in kinds:
            picked.append(item)
            kinds.add(item["kind"])
    for item in items:
        if len(picked) >= limit:
            break
        if item not in picked:
            picked.append(item)
    return picked[:limit]


def _dedupe(items: list[dict], limit: int = 30) -> list[dict]:
    """去重：同一条只留一次；标题+作者都相同的（同一天发的几条）合并成一条并记数量"""
    seen_id: set[str] = set()
    out: list[dict] = []
    index: dict[tuple[str, str, str], dict] = {}
    for item in items:
        key = f"{item['kind']}:{item['id']}"
        if key in seen_id:
            continue
        seen_id.add(key)

        same = (item["kind"], (item.get("title") or "").strip(), (item.get("owner") or "").strip())
        if same in index:
            index[same]["also"] = int(index[same].get("also") or 1) + 1
            continue
        item["also"] = 1
        index[same] = item
        out.append(item)
        if len(out) >= limit:
            break
    return out


def find_posts(db: Session, viewer, spot: str, city: str, province: str) -> dict:
    """按 景点 → 城市 → 省 的顺序找帖子；有同景点的就连同城的其它帖子一起给"""
    spot = (spot or "").strip()
    city = (city or "").strip()
    province = (province or "").strip() or province_of(city) or ""

    spot_hits = _match_spot(db, viewer, spot) if spot else []
    city_hits = _match_city(db, viewer, city) if city else []

    if spot_hits:
        return {
            "level": "spot",
            "hits": _pick_top(_dedupe(spot_hits + city_hits)),
            "spot_hits": len(spot_hits),
            "city_hits": len(city_hits),
        }

    if city_hits:
        return {"level": "city", "hits": _pick_top(_dedupe(city_hits)), "spot_hits": 0, "city_hits": len(city_hits)}

    prov_hits = _match_province(db, viewer, province, city) if province else []
    return {
        "level": "province" if prov_hits else "none",
        "hits": _pick_top(_dedupe(prov_hits)),
        "spot_hits": 0,
        "city_hits": 0,
    }
