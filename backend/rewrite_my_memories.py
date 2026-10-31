"""把主账号的记忆全部改写成旅游内容（标题 / 正文 / 标签 / 情绪 / 地点）

    python rewrite_my_memories.py
"""
import os
import hashlib
import json

import city_coords
from db import SessionLocal, init_db
from models import Location, Memory, User

# 按当前标题匹配（标题唯一），改写内容
NEW: dict[str, dict] = {
    "第一次坐轮渡去鼓浪屿": {
        "title": "厦门 · 第一次坐轮渡去鼓浪屿",
        "summary": (
            "轮渡码头坐船 20 分钟到三丘田，往返 35 元，一定要提前一天网上订——当天基本抢不到。\n"
            "上岛先往人少的方向走，龙头路太挤，往内厝澳那边才有老别墅的味道，岛上的猫比游客淡定。\n"
            "日光岩 50 元，爬 15 分钟能俯瞰全岛。中午海蛎煎 20 元配鱼丸汤 15 元。"

        ),
        "tags": ["旅行", "厦门", "鼓浪屿", "轮渡"],
        "emotion": "新鲜",
        "place": "鼓浪屿",
    },
    "海边的毕业夜": {
        "title": "厦门 · 毕业旅行最后一晚的白城沙滩",
        "summary": (
            "毕业旅行的最后一晚，我们在白城沙滩坐到天黑。\n"
            "买了 50 块钱的烟花，点着才发现海风太大，火苗歪得厉害。旁边也有别的毕业生，互相喊了句祝福。\n"
            "回民宿已经 12 点，鞋里全是沙，倒在玄关晾了一夜。"
        ),
        "tags": ["旅行", "毕业", "厦门", "海边", "夜"],
        "emotion": "不舍",
        "place": "厦门",
    },
    "入职第一天的手写笔记": {
        "title": "杭州 · 入职第一周，沿着西湖走到脚底板发烫",
        "summary": (
            "刚到杭州上班，下班没事就沿着西湖走，第一次走完全程花了两小时。\n"
            "后来才知道有共享单车，骑车 40 分钟能绕小半圈。\n"
            "晚饭在河坊街吃葱包烩 6 元一份，加辣酱更好吃。"
        ),
        "tags": ["旅行", "杭州", "西湖", "新生活"],
        "emotion": "期待",
        "place": "西湖",
    },
    "除夕夜的厨房": {
        "title": "南昌 · 过年回家，顺路登了滕王阁",
        "summary": (
            "除夕前几天陪爸妈去滕王阁，门票 50 元，登楼能看见赣江和对岸的高楼。\n"
            "讲解说「落霞与孤鹜齐飞」写的就是这一段，傍晚上去光最好。\n"
            "晚上回家做年夜饭，最受欢迎的还是妈妈的粉蒸肉。"
        ),
        "tags": ["旅行", "南昌", "滕王阁", "春节", "家人"],
        "emotion": "踏实",
        "place": "滕王阁",
    },
    "成都的第一个雨夜": {
        "title": "成都 · 五一落地就下雨，先吃了一顿火锅",
        "summary": (
            "五一飞成都，落地就下雨。打车到玉林路，青旅 90 元一晚。\n"
            "雨里找了家老火锅，微辣就已经够呛，油碟里加蒜泥才压得住。\n"
            "第二天去宽窄巷子，人挤人，其实旁边的小通巷更好逛，也没那么贵。"
        ),
        "tags": ["旅行", "成都", "火锅", "下雨"],
        "emotion": "过瘾",
        "place": "成都",
    },
    "西安城墙上的十公里": {
        "title": "西安 · 在城墙上骑了十公里",
        "summary": (
            "西安城墙门票 54 元，租自行车 45 元两小时。\n"
            "一圈 13.7 公里，我骑了 10 公里就下来了，屁股疼得受不了——租车记得挑软座。\n"
            "从南门上，傍晚的光最好。晚上回民街肉夹馍 15 元，羊肉泡馍 35 元。"
        ),
        "tags": ["旅行", "西安", "骑行", "古城"],
        "emotion": "痛快",
        "place": "西安",
    },
    "在家办公的第 40 天": {
        "title": "在家第 40 天，把三年的旅行在地图上标了一遍",
        "summary": (
            "那阵子出不了门，天天翻以前的照片。\n"
            "把三年去过的地方在地图上标了一遍，才发现厦门那趟其实绕了远路，当时完全没感觉。\n"
            "晚上跟朋友语音，说等能出门了先去哪。"
        ),
        "tags": ["旅行", "回忆", "地图"],
        "emotion": "想念",
        "place": "南昌",
    },
    "青岛的第一次下海": {
        "title": "青岛 · 八月下海，水凉得倒吸一口气",
        "summary": (
            "夏天去青岛，栈桥边喂的不是海鸥是麻雀——海鸥要十一月才来。\n"
            "第二海水浴场下海，水凉得倒吸一口气，沙滩上贝壳多，光脚要小心。\n"
            "晚上台东夜市，烤鱿鱼 15 元一串，蛤蜊 20 元一盆。"
        ),
        "tags": ["旅行", "青岛", "海边", "夏天"],
        "emotion": "凉爽",
        "place": "青岛",
    },
    "杭州的第一个夏天": {
        "title": "杭州 · 搬来后的第一个夏天，走了一遍杨公堤",
        "summary": (
            "从龙翔桥走到杨公堤，全程两个多小时。\n"
            "夏天下午太晒，建议四五点再出门，走到茅家埠那段最清净，几乎没人。\n"
            "路上买了根绿豆棒冰 3 元，救命。"
        ),
        "tags": ["旅行", "杭州", "西湖", "夏天"],
        "emotion": "舒服",
        "place": "西湖",
    },
    "和小林在杭州重逢": {
        "title": "杭州 · 小林出差来，我们在湖边走到喷泉结束",
        "summary": (
            "小林出差来杭州，约在湖滨银泰碰头，吃了顿粤菜。\n"
            "饭后沿湖走到音乐喷泉，晚上 7 点半开始，站前排会被水雾淋到。\n"
            "她说下次一起去看海——后来真的去了厦门。"
        ),
        "tags": ["旅行", "杭州", "重逢", "朋友"],
        "emotion": "开心",
        "place": "西湖",
    },
    "项目上线的那一夜": {
        "title": "杭州 · 通宵上线之后，去太子湾看了郁金香",
        "summary": (
            "熬夜上线到凌晨三点，第二天干脆请了假。\n"
            "坐地铁到太子湾公园，郁金香免费看，人是真多，八点前到能拍到没人的花坛。\n"
            "中午在附近吃了碗片儿川 18 元，回家睡了十二个小时。"
        ),
        "tags": ["旅行", "杭州", "太子湾", "春天"],
        "emotion": "松弛",
        "place": "杭州",
    },
    "中秋的阳台": {
        "title": "杭州 · 中秋一个人爬宝石山看月亮",
        "summary": (
            "中秋没回家，一个人去爬宝石山。从黄龙洞上山，20 分钟到初阳台，能看整个西湖。\n"
            "下山在曙光路买了鲜肉月饼，6 元一个，热的才好吃。\n"
            "晚上跟爸妈视频，把月亮举给镜头看。"
        ),
        "tags": ["旅行", "杭州", "宝石山", "中秋"],
        "emotion": "安静",
        "place": "杭州",
    },
    "第一次去东京": {
        "title": "东京 · 第一晚在浅草，第二天七点又去了一趟雷门",
        "summary": (
            "落地成田，坐 Skyliner 到日暮里 2470 日元，40 分钟。\n"
            "头一晚住浅草，晚上去雷门拍照人少；第二天早上 7 点再去一次浅草寺，抽签 100 日元，抽到大吉。\n"
            "仲见世通的仙贝现烤的，100 日元一片。"
        ),
        "tags": ["旅行", "东京", "浅草寺", "日本"],
        "emotion": "兴奋",
        "place": "东京",
    },
    "鸭川边，花瓣落进饭团": {
        "title": "京都 · 鸭川边吃便利店饭团，花瓣落进饭里",
        "summary": (
            "从东京坐新干线到京都，2 小时 15 分，自由席 13320 日元，早班车人少。\n"
            "鸭川边坐着吃便利店的饭团，风一吹樱花瓣掉进饭里，捡出来接着吃。\n"
            "伏见稻荷一定要 7 点前到，千本鸟居才拍得到空景，8 点后全是人头。"
        ),
        "tags": ["旅行", "京都", "樱花", "鸭川", "日本"],
        "emotion": "惬意",
        "place": "京都",
    },
    "东京的最后一晚": {
        "title": "东京 · 最后一晚在新宿，没赶末班车",
        "summary": (
            "最后一晚住新宿，晚饭在思い出横丁吃了烤串，人均 2500 日元。\n"
            "特意没赶末班车，在都厅前看夜景——免费展望室晚上 10 点半关，注意时间。\n"
            "回酒店路上买了瓶牛奶，日本便利店的牛奶比水好喝。"
        ),
        "tags": ["旅行", "东京", "夜", "日本"],
        "emotion": "留恋",
        "place": "东京",
    },
    "父亲生日的那通电话": {
        "title": "杭州 · 给父亲打完电话，去江边走了很久",
        "summary": (
            "父亲生日，电话里他说今年想来杭州看看西湖。\n"
            "挂了电话我沿钱塘江走了一段，江风很硬。\n"
            "查了一下高铁，南昌到杭州一个半小时，决定下次把他接来。"
        ),
        "tags": ["旅行", "杭州", "家人", "计划"],
        "emotion": "温暖",
        "place": "杭州",
    },
    "漫展散场后切开的蛋糕": {
        "title": "上海 · 漫展散场，在酒店切开一块蛋糕",
        "summary": (
            "元旦去上海逛漫展，8.2 号馆走了一天，脚底板发麻。\n"
            "散场后在便利店买了块小蛋糕，回酒店插了根蜡烛——跨年就这么过了。\n"
            "提醒：漫展别背太重，存包柜比想象中抢手。"
        ),
        "tags": ["旅行", "上海", "漫展", "跨年"],
        "emotion": "满足",
        "place": "上海",
    },
    "和小林的第二次厦门": {
        "title": "厦门 · 和小林又去了一次，这次没赶景点",
        "summary": (
            "第二次去厦门，学乖了：不赶景点，白天在沙坡尾喝咖啡，傍晚骑车走环岛路。\n"
            "沙茶面 15 元，比第一次吃的那家好吃。\n"
            "住宿选沙坡尾附近 260 元一晚，出门就是海。"
        ),
        "tags": ["旅行", "厦门", "海边", "重逢"],
        "emotion": "放松",
        "place": "厦门",
    },
    "群友送我的绘画": {
        "title": "东京 · 在神保町旧书店翻到的画",
        "summary": (
            "神保町一条街全是旧书店，下午三点多进去，光线正好。\n"
            "在角落翻到一张手绘插画，线条细，边上写着「西片先生，高木太太」。老板说是客人寄卖的，1500 日元。\n"
            "提醒：旧书店大多只收现金，去之前先取钱。"
        ),
        "tags": ["旅行", "东京", "旧书店", "手绘"],
        "emotion": "惊喜",
        "place": "东京",
    },
    "在8.2H的展厅里撑开粉伞": {
        "title": "上海 · 在 8.2 号馆撑开一把粉伞",
        "summary": (
            "漫展第二天，8.2 号馆人最多，走两步就要停一次。\n"
            "在道具区撑开一把粉伞拍照，光从馆顶的玻璃打下来，伞面上全是光斑。\n"
            "提醒：馆里空调很足，穿得少会冷；带水，排队买饮料要二十分钟。"
        ),
        "tags": ["旅行", "上海", "漫展", "道具"],
        "emotion": "热闹",
        "place": "上海",
    },
    "举过头顶的那只大碗": {
        "title": "漳州 · 老城骑楼下吃到一碗四果汤",
        "summary": (
            "漳州老城的骑楼连成一排，下雨天也淋不到。\n"
            "在路边吃到四果汤 8 元一碗，料给得很足，端起来拍照的时候差点洒了。\n"
            "下午在古城里走到台湾路，老房子比网红店好看。"
        ),
        "tags": ["旅行", "漳州", "老城", "美食"],
        "emotion": "满足",
        "place": "漳州",
    },
    "镜头前那颗歪掉的心": {
        "title": "福州 · 三坊七巷那顿烤肉",
        "summary": (
            "三坊七巷逛完在附近找了家烤肉店，人均 80 元。\n"
            "上菜前对着镜头比了个心，结果手举歪了，照片里那颗心是歪的，反而更喜欢这张。\n"
            "提醒：三坊七巷白天人多，傍晚进去拍灯光最好看。"
        ),
        "tags": ["旅行", "福州", "三坊七巷", "美食"],
        "emotion": "开心",
        "place": "福州",
    },
    "屏幕截图 2026-10-09 171155": {
        "title": "福州 · 赶路那天的两碗面",
        "summary": (
            "从福州出发那天早上，在巷口吃了碗拌面 6 元配锅边糊 5 元，吃完才有力气拖箱子。\n"
            "两碗一起下肚，是这趟旅行里最便宜也最舒服的一顿。\n"
            "提醒：福州站进站安检快，但早高峰打车要留 40 分钟。"
        ),
        "tags": ["旅行", "福州", "早餐", "赶路"],
        "emotion": "踏实",
        "place": "福州",
    },
}


# 消费明细 / 交通 / 住宿 / 提醒（按原标题匹配）
EXTRA: dict[str, dict] = {
    "第一次坐轮渡去鼓浪屿": {
        "costs": [
            {"label": "轮渡往返", "amount": 35, "note": "提前一天网上订"},
            {"label": "日光岩门票", "amount": 50, "note": None},
            {"label": "海蛎煎 + 鱼丸汤", "amount": 35, "note": "岛上小吃"},
            {"label": "民宿", "amount": 260, "note": "本岛一晚"},
        ],
        "transport": "邮轮中心厦鼓码头坐船 20 分钟到三丘田，往返 35 元；岛上没有车，全程靠走。",
        "stay": "住厦门本岛 260 元一晚，坐早班船进岛，人少。",
        "tips": "① 轮渡票当天基本抢不到，务必提前订\n② 龙头路太挤，往内厝澳方向走才有老别墅\n③ 岛上别买珊瑚和贝壳制品",
    },
    "海边的毕业夜": {
        "costs": [
            {"label": "烟花", "amount": 50, "note": "沙滩边小摊"},
            {"label": "沙滩烧烤", "amount": 80, "note": "四个人分"},
            {"label": "打车回民宿", "amount": 25, "note": None},
        ],
        "transport": "公交到白城沙滩，晚上打车回民宿。",
        "tips": "海边晚上风大，带件外套；烟花别在禁放区点。",
    },
    "入职第一天的手写笔记": {
        "costs": [
            {"label": "葱包烩", "amount": 6, "note": "河坊街"},
            {"label": "地铁", "amount": 4, "note": None},
        ],
        "transport": "地铁 1 号线到龙翔桥，出站就是湖滨，沿湖往北走。",
        "tips": "走完整个西湖要两小时，骑车 40 分钟就够小半圈。",
    },
    "除夕夜的厨房": {
        "costs": [
            {"label": "滕王阁门票", "amount": 50, "note": None},
            {"label": "年夜饭食材", "amount": 300, "note": "六个人吃"},
        ],
        "transport": "南昌西站打车到滕王阁 20 分钟，约 25 元。",
        "tips": "傍晚上楼光最好，能同时看到赣江和落霞。",
    },
    "成都的第一个雨夜": {
        "costs": [
            {"label": "青旅", "amount": 90, "note": "一晚"},
            {"label": "老火锅", "amount": 120, "note": "两个人"},
            {"label": "打车", "amount": 40, "note": None},
        ],
        "transport": "双流机场坐地铁 10 号线进城，40 分钟。",
        "stay": "住玉林路青旅 90 元一晚，楼下就是串串和酒馆。",
        "tips": "① 宽窄巷子人挤人，旁边的小通巷更好逛也更便宜\n② 火锅微辣就已经够呛，油碟里加蒜泥",
    },
    "西安城墙上的十公里": {
        "costs": [
            {"label": "城墙门票", "amount": 54, "note": None},
            {"label": "自行车租借", "amount": 45, "note": "两小时"},
            {"label": "肉夹馍", "amount": 15, "note": "回民街"},
            {"label": "羊肉泡馍", "amount": 35, "note": None},
        ],
        "transport": "地铁 2 号线永宁门站下，出站就是南门登城口。",
        "tips": "① 一圈 13.7 公里，挑软座的车，不然屁股遭罪\n② 傍晚上城墙，光线最好",
    },
    "在家办公的第 40 天": {
        "costs": [],
        "transport": "",
        "tips": "把去过的地方在地图上标一遍，能看出路线绕没绕远。",
    },
    "青岛的第一次下海": {
        "costs": [
            {"label": "更衣冲洗", "amount": 20, "note": "第二海水浴场"},
            {"label": "烤鱿鱼", "amount": 15, "note": "台东夜市"},
            {"label": "蛤蜊", "amount": 20, "note": "一盆"},
        ],
        "transport": "青岛站出来打车到栈桥 10 分钟；浴场之间坐 26 路公交。",
        "tips": "① 海鸥十一月才来，八月栈桥边喂的是麻雀\n② 沙滩贝壳多，光脚要小心",
    },
    "杭州的第一个夏天": {
        "costs": [
            {"label": "绿豆棒冰", "amount": 3, "note": "路上小卖部"},
            {"label": "地铁", "amount": 5, "note": None},
        ],
        "transport": "地铁到龙翔桥，沿湖往杨公堤方向走，两小时。",
        "tips": "夏天下午太晒，四五点再出门；茅家埠那段最清净。",
    },
    "和小林在杭州重逢": {
        "costs": [
            {"label": "粤菜", "amount": 180, "note": "两个人"},
            {"label": "咖啡", "amount": 60, "note": None},
        ],
        "transport": "湖滨银泰地铁 1 号线龙翔桥站直达。",
        "tips": "音乐喷泉晚上 7 点半开始，站前排会被水雾淋到。",
    },
    "项目上线的那一夜": {
        "costs": [
            {"label": "片儿川", "amount": 18, "note": "中午"},
            {"label": "地铁", "amount": 8, "note": "来回"},
        ],
        "transport": "地铁 4 号线水澄桥站出来走 10 分钟到太子湾公园。",
        "tips": "太子湾免费，八点前到能拍到没人的花坛。",
    },
    "中秋的阳台": {
        "costs": [
            {"label": "鲜肉月饼", "amount": 6, "note": "曙光路"},
            {"label": "公交", "amount": 4, "note": None},
        ],
        "transport": "黄龙洞上山，20 分钟到初阳台，能看整个西湖。",
        "tips": "下山的路比上山滑，穿抓地的鞋。",
    },
    "第一次去东京": {
        "costs": [
            {"label": "Skyliner", "amount": 2470, "note": "成田→日暮里，日元"},
            {"label": "浅草寺抽签", "amount": 100, "note": "日元"},
            {"label": "现烤仙贝", "amount": 100, "note": "仲见世通"},
            {"label": "住宿", "amount": 6000, "note": "浅草一晚，日元"},
        ],
        "transport": "成田机场坐 Skyliner 到日暮里，40 分钟 2470 日元。",
        "stay": "住浅草，晚上出门就是雷门，早上七点再去一次几乎没人。",
        "tips": "① 浅草寺七点前到最好拍\n② 便利店早餐比酒店便宜一半",
    },
    "鸭川边，花瓣落进饭团": {
        "costs": [
            {"label": "新干线", "amount": 13320, "note": "东京→京都自由席，日元"},
            {"label": "便利店饭团", "amount": 300, "note": "日元"},
            {"label": "伏见稻荷", "amount": 0, "note": "免费"},
        ],
        "transport": "东京坐新干线 2 小时 15 分到京都，自由席 13320 日元，早班车人少。",
        "tips": "① 伏见稻荷 7 点前到才拍得到空景\n② 鸭川边风大，饭团拿稳",
    },
    "东京的最后一晚": {
        "costs": [
            {"label": "烤串", "amount": 2500, "note": "思い出横丁，日元"},
            {"label": "牛奶", "amount": 160, "note": "便利店"},
        ],
        "transport": "新宿站步行 10 分钟到都厅前，免费展望室。",
        "tips": "都厅展望室晚上 10 点半关，别踩点去。",
    },
    "父亲生日的那通电话": {
        "costs": [{"label": "高铁票", "amount": 90, "note": "南昌→杭州二等座"}],
        "transport": "南昌西到杭州东，高铁一个半小时，二等座约 90 元。",
        "tips": "带长辈来杭州，住龙翔桥附近，出门就是西湖，不用走远。",
    },
    "漫展散场后切开的蛋糕": {
        "costs": [
            {"label": "漫展门票", "amount": 120, "note": "单日票"},
            {"label": "小蛋糕", "amount": 25, "note": "便利店"},
            {"label": "酒店", "amount": 400, "note": "一晚"},
        ],
        "transport": "虹桥坐地铁 2 号线到国家会展中心，出站跟着人流走。",
        "tips": "① 漫展别背太重，存包柜很抢手\n② 馆内走路一天两万步起",
    },
    "和小林的第二次厦门": {
        "costs": [
            {"label": "沙茶面", "amount": 15, "note": "比第一次那家好吃"},
            {"label": "住宿", "amount": 260, "note": "沙坡尾一晚"},
            {"label": "咖啡", "amount": 40, "note": None},
        ],
        "transport": "机场坐快线到轮渡，市内公交 1 元，环岛路租自行车 20 元/小时。",
        "stay": "住沙坡尾附近 260 元一晚，出门就是海。",
        "tips": "第二次学乖了：不赶景点，白天喝咖啡，傍晚骑车。",
    },
    "群友送我的绘画": {
        "costs": [
            {"label": "手绘插画", "amount": 1500, "note": "旧书店，日元"},
            {"label": "地铁", "amount": 200, "note": "日元"},
        ],
        "transport": "神保町站 A7 出口，书店街步行 5 分钟。",
        "tips": "旧书店大多只收现金，去之前先取钱。",
    },
    "在8.2H的展厅里撑开粉伞": {
        "costs": [
            {"label": "漫展门票", "amount": 150, "note": None},
            {"label": "饮料", "amount": 20, "note": "排队二十分钟"},
        ],
        "transport": "地铁 2 号线到国家会展中心，8.2 号馆离站最远。",
        "tips": "① 馆里空调足，穿得少会冷\n② 自己带水，买饮料要排很久",
    },
    "举过头顶的那只大碗": {
        "costs": [
            {"label": "四果汤", "amount": 8, "note": "路边摊"},
            {"label": "公交", "amount": 2, "note": None},
        ],
        "transport": "漳州站打车到古城 15 分钟，约 15 元。",
        "tips": "骑楼下雨天也淋不到，慢慢走一下午刚好。",
    },
    "镜头前那颗歪掉的心": {
        "costs": [
            {"label": "烤肉", "amount": 160, "note": "人均 80"},
            {"label": "打车", "amount": 20, "note": None},
        ],
        "transport": "福州站坐地铁 1 号线到东街口，走 10 分钟到三坊七巷。",
        "tips": "三坊七巷白天人多，傍晚进去拍灯光最好看。",
    },
    "屏幕截图 2026-10-09 171155": {
        "costs": [
            {"label": "拌面", "amount": 6, "note": "巷口"},
            {"label": "锅边糊", "amount": 5, "note": None},
            {"label": "打车到车站", "amount": 25, "note": "早高峰"},
        ],
        "transport": "住得离福州站不远，早高峰打车留 40 分钟，进站安检很快。",
        "tips": "福州早餐便宜又顶饱，两碗不到 15 元。",
    },
}


# 主账号：从环境变量读取，仓库里只保留演示默认值
OWNER_USERNAME = os.getenv("DEMO_OWNER_USER", "demo")
OWNER_PASSWORD = os.getenv("DEMO_OWNER_PASS", "demo123456")


def ensure_location(db, name: str) -> Location | None:
    existing = db.query(Location).filter(Location.name == name).first()
    if existing:
        return existing
    coords = city_coords.lookup_coords(name)
    city = name
    if not coords:
        for key in sorted(city_coords.CITY_COORDS, key=len, reverse=True):
            if key in name or name in key:
                coords, city = city_coords.CITY_COORDS[key], key
                break
    if not coords:
        return None
    loc = Location(
        id="loc_m_" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:10],
        name=name,
        city=city,
        latitude=coords[0],
        longitude=coords[1],
        precision="spot" if name != city else "city",
    )
    db.add(loc)
    db.flush()
    return loc


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        owner = db.query(User).filter(User.username == OWNER_USERNAME).first()
        if not owner:
            print("没有主账号")
            return

        rows = db.query(Memory).filter(Memory.user_id == owner.id).all()
        # 旧标题 → 新标题 的对照，方便用当前标题（可能已经改过）反查
        current_to_old = {spec["title"]: old for old, spec in NEW.items()}
        done = 0
        for memory in rows:
            old_key = memory.title if memory.title in NEW else current_to_old.get(memory.title)
            spec = NEW.get(old_key) if old_key else None
            if not spec:
                print(f"（没写内容，跳过）{memory.title}")
                continue
            memory.title = spec["title"]
            memory.summary = spec["summary"]
            memory.content = spec["summary"]
            memory.tags = json.dumps(spec["tags"], ensure_ascii=False)
            memory.emotion = spec["emotion"]
            if spec.get("place"):
                loc = ensure_location(db, spec["place"])
                if loc:
                    memory.location_id = loc.id

            extra = EXTRA.get(old_key or "", {})
            if extra.get("costs"):
                memory.cost_json = json.dumps(extra["costs"], ensure_ascii=False)
            if extra.get("transport"):
                memory.transport_info = extra["transport"]
            if extra.get("stay"):
                memory.stay_info = extra["stay"]
            if extra.get("tips"):
                memory.tips = extra["tips"]
            done += 1
        db.commit()
        print(f"[改写完成] {done} / {len(rows)} 条记忆已变成旅游内容（含消费明细）")
    finally:
        db.close()


if __name__ == "__main__":
    main()
