"""把每条记忆的正文都改成攻略那种开头：先说数 → 我的走法 → 正文

    python rewrite_memory_intros.py

对所有账号的记忆生效（我的 + 演示好友 + 陌生人的），可重复跑。
"""
import json
import re

from db import SessionLocal, init_db
from models import Location, Memory

# 每个城市一句「我的走法」——和攻略里那句是同一个口吻
CITY_TIP: dict[str, str] = {
    "杭州": "我的走法是早上七点前到断桥，十点之后西湖边就全是人了。",
    "东京": "我的走法是早上七点出门、中午回酒店睡一觉，傍晚再出门。",
    "上海": "我的走法是早上逛外滩、下午钻巷子，晚上再回江边看灯。",
    "厦门": "我的走法是早上上岛、下午回本岛，正好躲开旅行团那一波。",
    "福州": "我的走法是先吃碗拌面垫底，再去三坊七巷慢慢逛。",
    "黄山": "我的走法是山上住一晚，第二天早上六点去等云海。",
    "京都": "我的走法是七点前进伏见稻荷，八点之后人就满了。",
    "张家界": "我的走法是先坐索道上去、再走下来，膝盖省一半力。",
    "大理": "我的走法是逆时针环洱海，上午的光在才村这一侧。",
    "丽江": "我的走法是清早逛束河，下午再进城，晚上别去大研挤。",
    "青海湖": "我的走法是下午到湖边、夜里看银河，外套按冬天的厚度带。",
    "泰安": "我的走法是白天到、晚上十点开爬，四点到南天门等日出。",
    "成都": "我的走法是上午玩、下午吃、夜里再吃一轮。",
    "重庆": "我的走法是白天走路、晚上坐索道看江，导航失灵就问路。",
    "南昌": "我的走法是傍晚登滕王阁，能同时看到赣江和落霞。",
    "纽约": "我的走法是白天逛公园、晚上看灯，地铁比打车快。",
    "三亚": "我的走法是清早下海、中午躲太阳，四点后再回沙滩。",
    "桂林": "我的走法是坐竹筏不坐大船，遇龙河那段最舒服。",
    "阳朔": "我的走法是住西街外一公里，骑车去十里画廊。",
    "敦煌": "我的走法是莫高窟约早场，傍晚再去鸣沙山等日落。",
    "青岛": "我的走法是下午下海、晚上去台东夜市；海鸥十一月才来。",
    "广州": "我的走法是早晚出门、中午躲进糖水铺。",
    "罗马": "我的走法是斗兽场和梵蒂冈都提前订票，早上七点去喷泉。",
    "漳州": "我的走法是骑楼下慢慢走，一碗四果汤歇一次脚。",
    "拉萨": "我的走法是第一天什么都不做，第二天再去布达拉宫。",
    "鼓浪屿": "我的走法是上岛先往人少的方向走，日光岩留到下午。",
    "北京": "我的走法是长城放早上、胡同放傍晚，别一天塞满。",
    "武汉": "我的走法是早上吃热干面、下午登黄鹤楼，晚上坐轮渡过江。",
    "曼谷": "我的走法是清早去大皇宫，中午回酒店躲太阳。",
    "巴黎": "我的走法是铁塔看整点闪灯，卢浮宫只挑三大件。",
    "南京": "我的走法是傍晚到夫子庙，站在桥上看秦淮河就够。",
    "伦敦": "我的走法是先查塔桥开桥时间，再按它排当天行程。",
    "台北": "我的走法是白天 101、傍晚象山、晚上夜市。",
    "呼伦贝尔": "我的走法是自驾两天，见到好风景就停，别赶路。",
    "大阪": "我的走法是早上大阪城、下午道顿堀，串炸蘸酱只蘸一次。",
    "九寨沟": "我的走法是坐观光车到最里面，再一路走下来看水。",
    "新加坡": "我的走法是傍晚去滨海湾，躺在对岸草坪上看灯光秀。",
    "首尔": "我的走法是穿韩服逛景福宫（免票），晚上去汉江吹风。",
    "苏州": "我的走法是 8:30 一开园就进拙政园，十点后全是团。",
    "香格里拉": "我的走法是先松赞林寺、再普达措，海拔慢慢上。",
    "西安": "我的走法是傍晚上城墙骑车，晚上去回民街吃。",
    "乐山": "我的走法是先吃跷脚牛肉，再去看大佛；怕排队就坐船。",
    "昆明": "我的走法是落地先休整，翠湖喂完海鸥再说别的。",
    "张掖": "我的走法是下午五点后进丹霞，斜光下颜色才出来。",
    "兰州": "我的走法是早上七点去吃头汤牛肉面，八元一碗。",
}
FALLBACK_TIP = "我的走法是早上把重头戏做完，下午随缘。"
# 注意：是「我的走法是…」（不是冒号），这里按前缀去掉上一次加的开头
INTRO_PREFIXES = ("先说数：", "我的走法", "在哪：", "路线：")


def normalize_city(city: str | None) -> str:
    return re.sub(r"(市|都|区|县|省)$", "", (city or "").strip())


def build_intro(memory: Memory, city: str, place: str) -> str:
    date = (memory.happened_at or "")[:10]
    photos = memory.media_count or 0
    bits = [f"{date}"] if date else []
    if photos:
        bits.append(f"{photos} 张照片")
    if place:
        bits.append(place if place == city or not city else f"{city} · {place}")

    try:
        costs = json.loads(memory.cost_json or "[]")
    except Exception:
        costs = []
    total = sum(c.get("amount") or 0 for c in costs if isinstance(c, dict))
    spend = f"，这趟花了 ¥{int(total)}" if total else ""

    tip = CITY_TIP.get(city, FALLBACK_TIP)
    return f"先说数：{'，'.join(bits)}{spend}。\n{tip}"


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        memories = db.query(Memory).all()
        done = 0
        for memory in memories:
            loc = db.get(Location, memory.location_id) if memory.location_id else None
            city = normalize_city(loc.city if loc else None) or normalize_city(loc.name if loc else None)
            place = (loc.name if loc else "") or ""

            raw = (memory.content or memory.summary or "").strip()
            # 去掉上一次加过的开头，以及「提醒：…」那行（页面下面有独立的提醒块）
            body = "\n".join(
                line
                for line in raw.split("\n")
                if line.strip()
                and not line.startswith(INTRO_PREFIXES)
                and not line.lstrip().startswith("提醒：")
            ).strip()

            intro = build_intro(memory, city, place)
            memory.content = f"{intro}\n\n{body}" if body else intro
            done += 1
        db.commit()
        print(f"[完成] {done} 条记忆都加上了「先说数 / 我的走法」开头")
    finally:
        db.close()


if __name__ == "__main__":
    main()
