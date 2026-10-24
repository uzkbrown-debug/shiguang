"""一次性初始化：把旧数据归到主账号名下，并造两个演示好友（带路线 / 攻略 / 足迹）

    python seed_social.py

幂等：已经跑过就直接退出。
"""
import json
import uuid
from datetime import datetime

import city_coords
from auth import hash_password, new_salt
from db import SessionLocal, init_db
from models import (
    Friendship,
    Location,
    Memory,
    MemoryMedia,
    RoutePoint,
    TravelGuide,
    TravelRoute,
    User,
)

OWNER = {"username": "2206481523", "password": "123456wwk", "nickname": "我", "home_city": "上海"}

# 演示好友：账号 / 密码 / 昵称 / 一句话 / 常驻地
DEMO_USERS = [
    {
        "username": "xiaomei",
        "password": "123456",
        "nickname": "小美",
        "bio": "王盈芳的闺蜜，火锅和夜景爱好者。",
        "home_city": "成都",
        "route": {
            "title": "川渝四日：成都慢生活 + 重庆夜景",
            "summary": "不赶行程，白天喝茶晚上看江。",
            "start_date": "2025-10-02",
            "end_date": "2025-10-05",
            "tags": ["美食", "夜景", "慢旅行"],
            "points": [
                ("成都", "2025-10-02", 2, None, "玉林路小酒馆、人民公园喝茶"),
                ("乐山", "2025-10-04", 1, "高铁", "只为跷脚牛肉和大佛"),
                ("重庆", "2025-10-05", 1, "高铁", "洪崖洞、长江索道"),
            ],
        },
        "guide": {
            "title": "川渝四日怎么玩不累",
            "subtitle": "两个人 3800 元，吃到扶墙",
            "destination": "成都 · 乐山 · 重庆",
            "budget": "人均 1900 元",
            "best_season": "10 月",
            "transport_info": "成都到乐山、重庆都有高铁，1 小时左右；市内地铁 + 打车足够。",
            "stay_info": "成都住玉林路附近，重庆住解放碑，步行就能看夜景。",
            "summary": "这次没排满，每天只安排两件事：一个好地方，一顿好饭。",
            "tips": "洪崖洞晚上 7 点后人最多，从对岸拍更好看；乐山早点去排队。",
            "days": [
                ("第 1 天 · 成都", "人民公园喝茶 → 玉林路小吃 → 太古里逛街", "步行 + 地铁", "约 400 元"),
                ("第 2 天 · 乐山", "上午高铁到乐山，跷脚牛肉 + 大佛半日游", "高铁", "约 500 元"),
                ("第 3 天 · 重庆", "洪崖洞夜景，长江索道过江", "高铁 + 地铁", "约 600 元"),
            ],
            "cities": ["成都", "乐山", "重庆"],
        },
    },
    {
        "username": "ayuan",
        "password": "123456",
        "nickname": "阿远",
        "bio": "爱爬山，喜欢在洱海边发呆。",
        "home_city": "昆明",
        "route": {
            "title": "云南西北环线：昆明 → 大理 → 丽江",
            "summary": "六天，海拔慢慢往上走，先适应再上雪山。",
            "start_date": "2026-03-08",
            "end_date": "2026-03-13",
            "tags": ["自驾", "雪山", "湖"],
            "points": [
                ("昆明", "2026-03-08", 1, None, "落地休整，翠湖看海鸥"),
                ("大理", "2026-03-09", 2, "自驾", "环洱海，喜洲古镇"),
                ("丽江", "2026-03-11", 2, "自驾", "束河安静，玉龙雪山"),
            ],
        },
        "guide": {
            "title": "云南六天，先大理后丽江",
            "subtitle": "别把丽江放前面，会缺氧",
            "destination": "昆明 · 大理 · 丽江",
            "budget": "人均 3200 元",
            "best_season": "3—4 月",
            "transport_info": "昆明租车最划算，大理到丽江走高速 2.5 小时，沿途服务区能看雪山。",
            "stay_info": "大理住才村码头附近，安静；丽江住束河，比大研古城清净。",
            "summary": "海拔一天升一点，身体不会有太大反应，这条顺序是试出来的。",
            "tips": "玉龙雪山要提前一天预约大索道；洱海边骑行注意防晒。",
            "days": [
                ("第 1 天 · 昆明", "落地、取车、翠湖公园", "飞机 + 自驾", "约 500 元"),
                ("第 2—3 天 · 大理", "环洱海一圈，喜洲吃破酥粑粑", "自驾", "约 900 元"),
                ("第 4—6 天 · 丽江", "束河住两晚，玉龙雪山一日", "自驾", "约 1800 元"),
            ],
            "cities": ["昆明", "大理", "丽江"],
        },
    },
]

FOOTPRINTS = [
    ("大理", "2026-03-10", "洱海边骑了一下午，风大得说不出话", "friends"),
    ("丽江", "2026-03-12", "玉龙雪山脚下，云走得很快", "friends"),
    ("昆明", "2026-03-08", "翠湖的海鸥比人多", "friends"),
]


def ensure_location(db, name: str) -> Location:
    loc_id = "loc_" + name
    loc = db.get(Location, loc_id)
    if loc:
        return loc
    coords = city_coords.lookup_coords(name) or (0.0, 0.0)
    loc = Location(
        id=loc_id,
        name=name,
        city=name,
        region=None,
        country="中国",
        latitude=coords[0],
        longitude=coords[1],
        precision="city",
    )
    db.add(loc)
    db.flush()
    return loc


def make_user(db, spec: dict) -> User:
    salt = new_salt()
    user = User(
        id="usr_" + uuid.uuid4().hex[:10],
        username=spec["username"],
        nickname=spec["nickname"],
        password_hash=hash_password(spec["password"], salt),
        salt=salt,
        bio=spec.get("bio"),
        home_city=spec.get("home_city"),
    )
    db.add(user)
    db.flush()
    return user


def pick_covers(db, count: int) -> list[str]:
    rows = db.query(Memory.cover).filter(Memory.cover.isnot(None)).limit(40).all()
    urls = [r[0] for r in rows if r[0]]
    return urls[:count] if urls else []


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == OWNER["username"]).first():
            print("[seed] 账号已存在，跳过")
            return

        owner = make_user(db, OWNER)
        owner.bio = "拾光的主人，喜欢把旅行和日常都记下来。"
        db.flush()

        # 旧数据（user_id 还是 local 的）归到主账号名下
        moved = (
            db.query(Memory)
            .filter((Memory.user_id == "local") | (Memory.user_id.is_(None)))
            .update({"user_id": owner.id, "visibility": "friends"}, synchronize_session=False)
        )
        db.commit()
        print(f"[seed] {moved} 条旧记忆已归属主账号")

        covers = pick_covers(db, 8)

        for index, spec in enumerate(DEMO_USERS):
            friend = make_user(db, spec)

            # 互加好友（双向两条）
            db.add(Friendship(user_id=owner.id, friend_user_id=friend.id))
            db.add(Friendship(user_id=friend.id, friend_user_id=owner.id))

            route_spec = spec["route"]
            route = TravelRoute(
                id="rt_" + uuid.uuid4().hex[:10],
                user_id=friend.id,
                title=route_spec["title"],
                summary=route_spec["summary"],
                cover=covers[index * 2] if len(covers) > index * 2 else None,
                start_date=route_spec["start_date"],
                end_date=route_spec["end_date"],
                tags=json.dumps(route_spec["tags"], ensure_ascii=False),
                visibility="friends",
            )
            db.add(route)
            db.flush()

            for order, (name, arrive, stay, transport, note) in enumerate(route_spec["points"]):
                loc = ensure_location(db, name)
                db.add(
                    RoutePoint(
                        route_id=route.id,
                        sort=order,
                        name=name,
                        location_id=loc.id,
                        latitude=loc.latitude,
                        longitude=loc.longitude,
                        arrive_date=arrive,
                        stay_days=stay,
                        transport=transport,
                        note=note,
                    )
                )
                # 每个点顺手留一条足迹记忆，地图上就有 TA 的光点
                cover = covers[(index * 2 + order) % len(covers)] if covers else None
                mem_id = f"mem_{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}"
                db.add(
                    Memory(
                        id=mem_id,
                        title=f"{name} · {note.split('，')[0][:16]}",
                        summary=note,
                        content=note,
                        happened_at=f"{arrive}T10:00:00",
                        time_precision="day",
                        location_id=loc.id,
                        tags=json.dumps(route_spec["tags"], ensure_ascii=False),
                        emotion="开心",
                        importance=3,
                        source_type="photo",
                        cover=cover,
                        media_count=1 if cover else 0,
                        ai_status="confirmed",
                        confidence=0.9,
                        ai_generated=False,
                        user_id=friend.id,
                        visibility="friends",
                    )
                )
                if cover:
                    db.add(
                        MemoryMedia(
                            memory_id=mem_id, url=cover, caption=f"{name} · 路上", sort=0
                        )
                    )

            guide_spec = spec["guide"]
            guide = TravelGuide(
                id="tg_" + uuid.uuid4().hex[:10],
                user_id=friend.id,
                title=guide_spec["title"],
                subtitle=guide_spec["subtitle"],
                cover=route.cover,
                destination=guide_spec["destination"],
                day_count=len(guide_spec["days"]),
                budget=guide_spec["budget"],
                best_season=guide_spec["best_season"],
                transport_info=guide_spec["transport_info"],
                stay_info=guide_spec["stay_info"],
                summary=guide_spec["summary"],
                tips=guide_spec["tips"],
                route_id=route.id,
                visibility="friends",
                status="published",
            )
            db.add(guide)
            db.flush()

            from models import GuideDay, GuideMedia

            for order, (title, content, transport, cost) in enumerate(guide_spec["days"]):
                db.add(
                    GuideDay(
                        id="gd_" + uuid.uuid4().hex[:10],
                        guide_id=guide.id,
                        sort=order,
                        title=title,
                        content=content,
                        transport=transport,
                        cost=cost,
                    )
                )
            for order, city in enumerate(guide_spec["cities"]):
                url = covers[(index * 3 + order) % len(covers)] if covers else None
                if url:
                    db.add(
                        GuideMedia(
                            guide_id=guide.id, url=url, caption=f"{city} · 随手拍", sort=order
                        )
                    )

        db.commit()

        counts = {
            "users": db.query(User).count(),
            "routes": db.query(TravelRoute).count(),
            "guides": db.query(TravelGuide).count(),
            "memories": db.query(Memory).count(),
        }
        print(f"[seed] 完成：{counts}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
