"""给地图上「还没有攻略出处」的地点补写攻略 + 路线

地图的「出处」来自两处：路线第几站、攻略第几天。有些地点在现有 14 篇攻略里
一次都没被写到，这里按 tg_demo_39a6ca2e / tg_demo_83e1090a 那两篇的写法补上：

    先说数 / 路线 / 我的走法 / 季节  +  分天行程（具体价格·时间·机位·避坑）
    + 交通 / 住宿 / 提醒 / 图集 + 一条对应的路线

    python add_missing_guides.py

按固定 id 幂等：重复跑会先删掉自己建过的攻略、分天、图集和路线再重建。
"""
import json
import uuid

import city_coords
from db import SessionLocal, init_db
from models import GuideDay, GuideMedia, Location, RoutePoint, TravelGuide, TravelRoute

P = "/media/uploads/"

GUIDES: list[dict] = [
    {
        "id": "tg_demo_b1c0a001",
        "user_id": "usr_c28e462a0e",
        "title": "南昌两日：滕王阁和一碗拌粉",
        "subtitle": "2 天 1 晚，一个人 320 元，主要为了回家",
        "destination": "南昌",
        "day_count": 2,
        "budget": "人均 320 元（门票 50 + 吃 120 + 交通 150）",
        "best_season": "2 月 / 10 月",
        "summary": (
            "先说数：2 天 1 晚，一个人，总共 320 元。\n"
            "路线：滕王阁 → 万寿宫 → 八一广场，都在老城，走路就能串起来。\n"
            "我的走法是傍晚上滕王阁，看完落霞再下楼吃饭。\n"
            "2 月初去的，江风冷，穿厚一点。"
        ),
        "transport_info": "南昌西站坐地铁 2 号线进城 40 分钟；滕王阁打车 20 分钟，约 25 元。",
        "stay_info": "住八一广场附近（约 180 元/晚），出门就是地铁。",
        "tips": "① 滕王阁傍晚上楼，光线和落霞最好\n② 万寿宫街区晚上灯好看，但吃的偏贵\n③ 拌粉和瓦罐汤是早饭标配，人均 10 元",
        "media": [
            ("/images/34.webp", "南昌 · 滕王阁"),
            ("/images/36.webp", "南昌 · 赣江边"),
            ("/images/39.webp", "南昌 · 万寿宫"),
        ],
        "route": {
            "id": "rt_demo_b1c0a001",
            "title": "南昌两日：滕王阁 + 老城",
            "summary": "滕王阁 → 万寿宫 → 八一广场，两天走完，全程在地铁 2 号线附近。",
            "points": [("南昌", "loc_nanchang")],
        },
        "days": [
            {
                "title": "第 1 天 · 滕王阁",
                "content": (
                    "傍晚上楼，门票 50 元，登楼能同时看到赣江和对岸的高楼。\n"
                    "讲解说「落霞与孤鹜齐飞」写的就是这一段，傍晚上去光最好。\n"
                    "下来沿江走 20 分钟到万寿宫，晚饭拌粉 6 元配瓦罐汤 5 元。"
                ),
                "transport": "打车 + 步行",
                "cost": "约 150 元",
            },
            {
                "title": "第 2 天 · 老城",
                "content": (
                    "早上去八一广场转一圈，然后钻进巷子吃一碗牛肉拌粉。\n"
                    "下午去江西省博物馆（免费，需提前预约），看完直接坐地铁去西站。\n"
                    "西站进站安检快，留 30 分钟就够。"
                ),
                "transport": "地铁 + 步行",
                "cost": "约 170 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a002",
        "user_id": "usr_c28e462a0e",
        "title": "西安三日：城墙、泡馍和兵马俑",
        "subtitle": "3 天 2 晚，一个人 1180 元，市区两天临潼一天",
        "destination": "西安",
        "day_count": 3,
        "budget": "人均 1180 元（门票 300 + 吃 350 + 住宿 300 + 交通 230）",
        "best_season": "4 月 / 10 月",
        "summary": (
            "先说数：3 天 2 晚，一个人，总共 1180 元。\n"
            "路线：城墙 → 回民街 → 兵马俑，市区两天、临潼一天。\n"
            "我的走法是傍晚上城墙骑车，晚上去回民街吃，兵马俑放到最后一天早上。\n"
            "10 月初去的，白天 20 度，早晚要外套。"
        ),
        "transport_info": "咸阳机场坐城际到北客站 30 分钟；市区地铁 2 号线贯穿南北，很够用。",
        "stay_info": "住钟楼或南门附近（约 200 元/晚），出门就是城墙。",
        "tips": "① 城墙一圈 13.7 公里，租软座的车\n② 兵马俑开门就进，十点后全是团\n③ 回民街主街贵，往洒金桥走",
        "media": [
            ("/images/39.webp", "西安 · 城墙"),
            ("/images/41.webp", "西安 · 回民街"),
            ("/images/42.webp", "西安 · 大雁塔"),
        ],
        "route": {
            "id": "rt_demo_b1c0a002",
            "title": "西安三日：城墙 + 兵马俑",
            "summary": "城墙 → 大雁塔 → 兵马俑，两天市区一天临潼。",
            "points": [("西安", "loc_xian")],
        },
        "days": [
            {
                "title": "第 1 天 · 城墙",
                "content": (
                    "门票 54 元，租自行车 45 元两小时，从南门上，傍晚的光最好。\n"
                    "一圈 13.7 公里，我骑了 10 公里就下来了，屁股疼——记得挑软座。\n"
                    "晚上回民街肉夹馍 15 元、羊肉泡馍 35 元。"
                ),
                "transport": "地铁",
                "cost": "约 320 元",
            },
            {
                "title": "第 2 天 · 老城 + 大唐不夜城",
                "content": (
                    "上午陕西历史博物馆（免费，提前约），下午大雁塔 50 元。\n"
                    "晚上大唐不夜城走走，不花钱也能逛两小时。\n"
                    "早饭去洒金桥喝胡辣汤 8 元，比回民街实在。"
                ),
                "transport": "地铁",
                "cost": "约 260 元",
            },
            {
                "title": "第 3 天 · 兵马俑",
                "content": (
                    "地铁 9 号线转游 5 路，一小时到临潼。\n"
                    "门票 120 元含丽山园，一号坑先看，讲解器 20 元值得租。\n"
                    "下午回市区，赶晚上的高铁。"
                ),
                "transport": "地铁 + 公交",
                "cost": "约 600 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a003",
        "user_id": "usr_bdffaf2123",
        "title": "青岛三日：栈桥、浴场和台东夜市",
        "subtitle": "3 天 2 晚，一个人 860 元，基本都泡在海边",
        "destination": "青岛",
        "day_count": 3,
        "budget": "人均 860 元（住宿 400 + 吃 300 + 门票 160）",
        "best_season": "8 月 / 12 月",
        "summary": (
            "先说数：3 天 2 晚，一个人，总共 860 元。\n"
            "路线：栈桥 → 第二海水浴场 → 台东夜市，沿海一条线。\n"
            "我的走法是下午下海、晚上去台东吃；想看海鸥得等十一月。\n"
            "8 月去的，水凉得倒吸一口气，但晒。"
        ),
        "transport_info": "青岛站出来打车到栈桥 10 分钟；浴场之间坐 26 路公交。",
        "stay_info": "住栈桥或火车站附近（约 260 元/晚），走路就到海边。",
        "tips": "① 海鸥十一月才来，八月栈桥边喂的是麻雀\n② 沙滩贝壳多，光脚要小心\n③ 台东夜市烤鱿鱼 15 元一串，蛤蜊 20 元一盆",
        "media": [
            (P + "demo_751c13e8ed73a4d1.jpg", "青岛 · 栈桥"),
            (P + "demo_9b88702d9a7c2bd8.jpg", "青岛 · 海边"),
            ("/images/42.webp", "青岛 · 第二海水浴场"),
        ],
        "route": {
            "id": "rt_demo_b1c0a003",
            "title": "青岛三日：沿海一条线",
            "summary": "栈桥 → 第二海水浴场 → 台东夜市，三天都在海边。",
            "points": [("青岛", "loc_qingdao")],
        },
        "days": [
            {
                "title": "第 1 天 · 栈桥",
                "content": (
                    "青岛站出来打车 10 分钟，栈桥本身不要钱，走到底就是回澜阁。\n"
                    "八月栈桥边喂的不是海鸥是麻雀——海鸥要十一月才来。\n"
                    "晚上台东夜市，烤鱿鱼 15 元一串，蛤蜊 20 元一盆。"
                ),
                "transport": "步行",
                "cost": "约 200 元",
            },
            {
                "title": "第 2 天 · 第二海水浴场",
                "content": (
                    "下海水凉得倒吸一口气，沙滩上贝壳多，光脚要小心。\n"
                    "更衣冲洗 20 元，毛巾自己带；中午回去睡一觉，四点再回来。\n"
                    "傍晚沿八大关走走，路两边全是老房子。"
                ),
                "transport": "公交",
                "cost": "约 330 元",
            },
            {
                "title": "第 3 天 · 老城",
                "content": (
                    "上午去小鱼山 15 元，能看到红瓦和海。\n"
                    "中午劈柴院吃一碗海鲜疙瘩汤 25 元，下午从青岛站走。\n"
                    "老城的坡道多，拖箱子预留时间。"
                ),
                "transport": "公交 + 步行",
                "cost": "约 330 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a004",
        "user_id": "usr_c28e462a0e",
        "title": "漳州一日：骑楼下的四果汤",
        "subtitle": "1 天，一个人 90 元，厦门往返刚好",
        "destination": "漳州",
        "day_count": 1,
        "budget": "人均 90 元（吃 40 + 交通 50）",
        "best_season": "10 月 / 4 月",
        "summary": (
            "先说数：1 天，一个人，总共 90 元。\n"
            "路线：漳州古城 → 台湾路 → 香港路，全都在骑楼底下。\n"
            "我的走法是骑楼下慢慢走，一碗四果汤歇一次脚。\n"
            "10 月去的，不冷不热，下雨也淋不到。"
        ),
        "transport_info": "漳州站打车到古城 15 分钟，约 15 元；古城里全程步行。",
        "stay_info": "一般当天从厦门往返，不用在漳州住。",
        "tips": "① 骑楼连成一排，下雨天也淋不到\n② 四果汤 8 元一碗，料给得很足\n③ 老房子比网红店好看，往台湾路走",
        "media": [
            (P + "cf77787160814934.png", "漳州 · 老城骑楼"),
        ],
        "route": {
            "id": "rt_demo_b1c0a004",
            "title": "厦门 + 漳州：一天来回",
            "summary": "厦门 → 漳州古城 → 回厦门，动车半小时，适合抽一天。",
            "points": [("厦门", "loc_xiamen"), ("漳州", "loc_7a37e958")],
        },
        "days": [
            {
                "title": "第 1 天 · 漳州古城",
                "content": (
                    "漳州站打车 15 分钟到古城，骑楼连成一排，下雨天也淋不到。\n"
                    "路边吃到四果汤 8 元一碗，端起来拍照差点洒了。\n"
                    "下午走到台湾路，老房子比网红店好看；傍晚动车回厦门。"
                ),
                "transport": "步行 + 动车",
                "cost": "约 90 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a005",
        "user_id": "usr_c28e462a0e",
        "title": "福州两日：三坊七巷和两碗面",
        "subtitle": "2 天 1 晚，一个人 460 元，老城走路就逛完",
        "destination": "福州",
        "day_count": 2,
        "budget": "人均 460 元（吃 200 + 交通 60 + 住宿 200）",
        "best_season": "10 月 / 3 月",
        "summary": (
            "先说数：2 天 1 晚，一个人，总共 460 元。\n"
            "路线：三坊七巷 → 上下杭 → 烟台山，老城走路就能串完。\n"
            "我的走法是先吃碗拌面垫底，再去三坊七巷慢慢逛，傍晚进去拍灯光。\n"
            "10 月去的，不热，晚上要加件薄外套。"
        ),
        "transport_info": "福州站坐地铁 1 号线到东街口，走 10 分钟到三坊七巷；早高峰打车留 40 分钟。",
        "stay_info": "住东街口或三坊七巷附近（约 200 元/晚），出门就能逛。",
        "tips": "① 三坊七巷白天人多，傍晚进去拍灯光最好看\n② 巷口拌面 6 元配锅边糊 5 元，是本地早饭标配\n③ 福州站进站安检快，早高峰打车要留 40 分钟",
        "media": [
            (P + "79d2092127a3b0fc.jpg", "福州 · 三坊七巷"),
            (P + "8c6a6ff31630d12f.png", "福州 · 巷口的拌面"),
        ],
        "route": {
            "id": "rt_demo_b1c0a005",
            "title": "福州两日：老城慢走",
            "summary": "三坊七巷 → 上下杭 → 烟台山，走路就能串起来。",
            "points": [("福州", "loc_296e25ac")],
        },
        "days": [
            {
                "title": "第 1 天 · 三坊七巷",
                "content": (
                    "地铁 1 号线东街口站出来走 10 分钟，白天人多，傍晚进去拍灯光最好看。\n"
                    "巷子里的老宅子走进去不要钱，穿堂风一吹就是一下午。\n"
                    "逛完在附近吃烤肉，人均 80 元。"
                ),
                "transport": "地铁 + 步行",
                "cost": "约 200 元",
            },
            {
                "title": "第 2 天 · 上下杭 + 赶车",
                "content": (
                    "早上去上下杭，河边的老码头改成了街区，人不多。\n"
                    "出发前在巷口吃拌面 6 元配锅边糊 5 元，吃完才有力气拖箱子。\n"
                    "打车到福州站，早高峰留 40 分钟。"
                ),
                "transport": "打车",
                "cost": "约 260 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a006",
        "user_id": "usr_368e73d1b9",
        "title": "呼伦贝尔五日：自驾草原",
        "subtitle": "5 天 4 晚，两个人人均 3200 元，一天最多开 200 公里",
        "destination": "呼伦贝尔",
        "day_count": 3,
        "budget": "人均 3200 元（租车 1750 + 住宿 1200 + 吃 800 + 油费 400）",
        "best_season": "7—8 月",
        "summary": (
            "先说数：5 天 4 晚，两个人，人均 3200 元（含租车和油费）。\n"
            "路线：海拉尔 → 额尔古纳 → 恩和 → 满洲里，一路沿着边防公路走。\n"
            "我的走法是见到好看的地方就停，别赶路，一天最多开 200 公里。\n"
            "8 月去的，白天 25 度，晚上要穿外套，蚊子比想象中多。"
        ),
        "transport_info": "海拉尔机场取车，紧凑型 SUV 约 350 元/天；草原上基本没有公交。",
        "stay_info": "住额尔古纳、恩和的民宿（约 300 元/晚），晚上能听见风声。",
        "tips": "① 油箱过半就找加油站，草原上间隔很远\n② 边防公路部分路段没有信号，先下离线地图\n③ 防蚊液和长袖必带，傍晚蚊子成团",
        "media": [
            (P + "demo_47533ffb8d91e543.jpg", "呼伦贝尔 · 草原"),
            (P + "demo_18eec2f2e07c9f71.jpg", "呼伦贝尔 · 日落"),
        ],
        "route": {
            "id": "rt_demo_b1c0a006",
            "title": "呼伦贝尔环线：海拉尔 → 满洲里",
            "summary": "海拉尔取车，沿边防公路经额尔古纳、恩和到满洲里，五天一圈。",
            "points": [("呼伦贝尔", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 呼伦贝尔（海拉尔）",
                "content": (
                    "落地取车，机场到市区 20 分钟。\n"
                    "先补给：水和零食在市区超市买齐，草原上很贵。\n"
                    "晚上吃一顿手把肉，人均 80 元。"
                ),
                "transport": "自驾",
                "cost": "约 700 元",
            },
            {
                "title": "第 2—3 天 · 额尔古纳 / 恩和",
                "content": (
                    "出城两小时就看不到一棵树，导航上全是空白。\n"
                    "莫尔格勒河边看日落，风大得站不稳；晚上住恩和的木刻楞（约 300 元/晚）。\n"
                    "见到好看的地方就停，别赶路，一天最多开 200 公里。"
                ),
                "transport": "自驾",
                "cost": "约 1400 元",
            },
            {
                "title": "第 4—5 天 · 满洲里",
                "content": (
                    "沿边防公路往满洲里走，路上几乎遇不到车。\n"
                    "套娃广场和国门可以看看，门票 50 元。\n"
                    "回海拉尔还车，赶晚上的飞机。"
                ),
                "transport": "自驾",
                "cost": "约 1100 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a007",
        "user_id": "usr_368e73d1b9",
        "title": "黄山两日：等一场云海",
        "subtitle": "2 天 1 晚，一个人 1290 元，山上住一晚值得",
        "destination": "黄山",
        "day_count": 2,
        "budget": "人均 1290 元（门票 190 + 索道 160 + 住宿 400 + 吃 300 + 交通 240）",
        "best_season": "4—5 月 / 11 月",
        "summary": (
            "先说数：2 天 1 晚，一个人，总共 1290 元。\n"
            "路线：汤口 → 玉屏楼 → 光明顶 → 北海，上山索道、下山步行。\n"
            "我的走法是山上住一晚，第二天早上六点去等云海，前一天下雨也不下山。\n"
            "11 月去的，山上比山下低 10 度，风很硬。"
        ),
        "transport_info": "黄山北站坐景区大巴到汤口 40 分钟，再换乘索道或步行上山。",
        "stay_info": "山上住一晚（约 400 元/晚），为的是第二天早上的云海。",
        "tips": "① 云海多在雨后转晴的清晨，前一晚看湿度再决定早起\n② 山上物价翻三倍，水和干粮自己带\n③ 索道和山上住宿提前订，周末翻倍",
        "media": [
            (P + "demo_afcc8e2cac7a73c1.jpg", "黄山 · 云海"),
            (P + "demo_d2a91f5afdf0b927.jpg", "黄山 · 松"),
        ],
        "route": {
            "id": "rt_demo_b1c0a007",
            "title": "黄山两日：玉屏楼到北海",
            "summary": "汤口 → 玉屏楼 → 光明顶 → 北海，山上住一晚等云海。",
            "points": [("黄山", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 玉屏楼 / 光明顶",
                "content": (
                    "黄山北站坐大巴到汤口，换索道上山，门票 190 元、索道 80 元。\n"
                    "迎客松在玉屏楼，下午四点多过去人最少；然后走到光明顶看日落。\n"
                    "山上住一晚 400 元起，晚饭一份盖饭 60 元。"
                ),
                "transport": "索道 + 步行",
                "cost": "约 700 元",
            },
            {
                "title": "第 2 天 · 北海 / 云海",
                "content": (
                    "五点半起床，六点站在山脊上，云在脚下，山尖像一个个岛。\n"
                    "云海多在雨后转晴的清晨，前一天下雨别急着下山。\n"
                    "走北海一路下山，中午回到汤口，赶下午的车。"
                ),
                "transport": "步行 + 索道",
                "cost": "约 590 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a008",
        "user_id": "usr_bdb13bda6d",
        "title": "张家界三日：天门山的云在脚下",
        "subtitle": "3 天 2 晚，两个人人均 1800 元，先索道再走路",
        "destination": "张家界",
        "day_count": 3,
        "budget": "人均 1800 元（门票 456 + 索道 347 + 住宿 400 + 吃 400 + 交通 200）",
        "best_season": "5 月 / 9 月",
        "summary": (
            "先说数：3 天 2 晚，两个人，人均 1800 元。\n"
            "路线：天门山 → 国家森林公园 → 袁家界，两天在山上一天在市区。\n"
            "我的走法是先坐索道上去、再一路走下来，膝盖省一半力。\n"
            "5 月去的，山上雨多，雾一散石柱就一根根冒出来。"
        ),
        "transport_info": "张家界西站到市区 20 分钟；天门山索道下站就在市区，走几步就到。",
        "stay_info": "住市区索道站附近（约 200 元/晚），早上出门就能排队。",
        "tips": "① 门票四天有效，别想着一天赶完\n② 山顶比山下低 8 度，外套带上\n③ 索道早上排队最长，下午反而快",
        "media": [
            (P + "demo_3d5e1e83ddc9f731.jpg", "张家界 · 天门山"),
            (P + "demo_54bcdb121853c103.jpg", "张家界 · 石柱"),
        ],
        "route": {
            "id": "rt_demo_b1c0a008",
            "title": "张家界三日：天门山 + 森林公园",
            "summary": "天门山 → 国家森林公园 → 袁家界，先索道后步行。",
            "points": [("张家界", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 天门山",
                "content": (
                    "门票 228 元含观光车，四天有效；索道单程 72 元，上山那趟一定买。\n"
                    "玻璃栈道另收 5 元，鞋套也要钱，恐高的可以绕。\n"
                    "云在脚下的时候，山下的路完全看不见。"
                ),
                "transport": "索道",
                "cost": "约 600 元",
            },
            {
                "title": "第 2 天 · 国家森林公园",
                "content": (
                    "门票 228 元，观光车随便坐。\n"
                    "金鞭溪走一段，两边全是石柱，走两小时不觉得累。\n"
                    "晚上住武陵源，比市区安静。"
                ),
                "transport": "观光车 + 步行",
                "cost": "约 700 元",
            },
            {
                "title": "第 3 天 · 袁家界",
                "content": (
                    "坐百龙天梯 72 元上去，看哈利路亚山的原型。\n"
                    "天下第一桥走过去十分钟，桥底下就是空的。\n"
                    "下午下山回市区，赶高铁。"
                ),
                "transport": "天梯 + 观光车",
                "cost": "约 500 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a009",
        "user_id": "usr_efd70adaaa",
        "title": "九寨沟三日：五花海的颜色",
        "subtitle": "3 天 2 晚，两个人人均 2100 元，沟里一整天",
        "destination": "九寨沟",
        "day_count": 3,
        "budget": "人均 2100 元（门票 169 + 住宿 600 + 吃 500 + 交通 830）",
        "best_season": "10 月",
        "summary": (
            "先说数：3 天 2 晚，两个人，人均 2100 元。\n"
            "路线：成都 → 九寨沟 → 沟口，路上一天、沟里一天、回程一天。\n"
            "我的走法是坐观光车到最里面，再一路走下来看水。\n"
            "10 月去的，彩林正好，五花海的颜色像打翻了颜料。"
        ),
        "transport_info": "成都坐大巴 8 小时，或飞九黄机场再坐 1.5 小时车；沟内全程观光车。",
        "stay_info": "住沟口漳扎镇（约 300 元/晚），第二天一早进沟。",
        "tips": "① 先去最里面的长海，再往回走，省力\n② 上午十点前光线最好，人也少\n③ 海拔 3000，第一晚别洗澡",
        "media": [
            (P + "demo_b7c8908b819a6811.jpg", "九寨沟 · 五花海"),
            (P + "demo_62751e0ed29900c3.jpg", "九寨沟 · 海子"),
        ],
        "route": {
            "id": "rt_demo_b1c0a009",
            "title": "成都 + 九寨沟：三天来回",
            "summary": "成都 → 九寨沟 → 成都，路上两天，沟里一天。",
            "points": [("成都", "loc_chengdu"), ("九寨沟", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 路上",
                "content": (
                    "成都出发，大巴 8 小时，或者飞九黄机场再坐 1.5 小时车。\n"
                    "山路弯多，晕车药提前吃。\n"
                    "晚上住沟口漳扎镇，早点睡。"
                ),
                "transport": "大巴",
                "cost": "约 900 元",
            },
            {
                "title": "第 2 天 · 五花海 / 长海",
                "content": (
                    "门票 169 元含观光车，先坐到最里面的长海。\n"
                    "再一路走下来：五花海、镜海、珍珠滩，上午十点前光线最好。\n"
                    "一天刚好走完，别贪多。"
                ),
                "transport": "观光车 + 步行",
                "cost": "约 600 元",
            },
            {
                "title": "第 3 天 · 回程",
                "content": (
                    "早上再进沟补一次五花海（门票两日内有效）。\n"
                    "中午出沟，下午坐车回成都。"
                ),
                "transport": "大巴",
                "cost": "约 600 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a00a",
        "user_id": "usr_ac937bb031",
        "title": "新加坡四日：滨海湾的灯",
        "subtitle": "4 天 3 晚，两个人人均 6800 元，城市小地铁全到",
        "destination": "新加坡",
        "day_count": 4,
        "budget": "人均 6800 元（机票 2600 + 住宿 2400 + 吃 1400 + 门票 400）",
        "best_season": "2 月 / 7 月",
        "summary": (
            "先说数：4 天 3 晚，两个人，人均 6800 元（含往返机票 2600）。\n"
            "路线：滨海湾 → 牛车水 → 圣淘沙，城市很小，地铁基本都能到。\n"
            "我的走法是傍晚去滨海湾，躺在对岸草坪上看灯光秀。\n"
            "2 月去的，白天 32 度，雨说来就来，伞常备。"
        ),
        "transport_info": "樟宜机场坐地铁 40 分钟进城；市内地铁和公交用同一张卡。",
        "stay_info": "住 Bugis 或牛车水（约 120 新币/晚），地铁两站到滨海湾。",
        "tips": "① 灯光秀每晚 8 点和 9 点各一场，提前十分钟占草坪\n② 室内空调很足，带件薄外套\n③ 地铁上不能吃东西，口香糖别带",
        "media": [
            (P + "demo_f9325743423fad82.jpg", "新加坡 · 滨海湾"),
            (P + "demo_1d20ede2c349504f.jpg", "新加坡 · 灯光秀"),
        ],
        "route": {
            "id": "rt_demo_b1c0a00a",
            "title": "新加坡四日：滨海湾 + 圣淘沙",
            "summary": "滨海湾 → 牛车水 → 圣淘沙，地铁和捷运基本全覆盖。",
            "points": [("新加坡", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 滨海湾",
                "content": (
                    "傍晚去滨海湾，灯光秀每晚 8 点和 9 点各一场，一场 15 分钟。\n"
                    "对岸草坪是最舒服的位置，躺着看就行，不用挤在金沙楼下。\n"
                    "金沙空中花园观景台要另买票，其实楼下看已经够了。"
                ),
                "transport": "地铁",
                "cost": "约 1500 元",
            },
            {
                "title": "第 2 天 · 牛车水 / 小印度",
                "content": (
                    "上午牛车水，中午麦士威熟食中心，海南鸡饭 6 新币。\n"
                    "下午小印度，颜色比照片还浓。\n"
                    "晚上克拉码头坐河边喝一杯，人均 25 新币。"
                ),
                "transport": "地铁 + 步行",
                "cost": "约 1200 元",
            },
            {
                "title": "第 3 天 · 圣淘沙",
                "content": (
                    "怡丰城坐捷运上岛 4 新币，环球影城门票 83 新币。\n"
                    "不玩项目就沿着海滩走，西乐索海滩人最少。\n"
                    "傍晚回本岛，鱼尾狮公园看看夜景。"
                ),
                "transport": "捷运",
                "cost": "约 2100 元",
            },
            {
                "title": "第 4 天 · 乌节路 / 樟宜",
                "content": (
                    "上午乌节路逛一圈，其实东西不比国内便宜。\n"
                    "提前三小时到樟宜，星耀樟宜的瀑布在 T1，值得留一小时。"
                ),
                "transport": "地铁",
                "cost": "约 2000 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a00b",
        "user_id": "usr_bdffaf2123",
        "title": "三亚四日：亚龙湾的水",
        "subtitle": "4 天 3 晚，两个人人均 3800 元，基本都泡在海边",
        "destination": "三亚",
        "day_count": 3,
        "budget": "人均 3800 元（机票 1600 + 住宿 1500 + 吃 500 + 玩 200）",
        "best_season": "1 月 / 12 月",
        "summary": (
            "先说数：4 天 3 晚，两个人，人均 3800 元（含往返机票 1600）。\n"
            "路线：大东海 → 亚龙湾 → 蜈支洲岛，基本都在海边。\n"
            "我的走法是清早下海、中午躲太阳，四点后再回沙滩。\n"
            "1 月去的，水不冷，中午太阳也够毒。"
        ),
        "transport_info": "凤凰机场坐 8 路或打车到市区 30 分钟；亚龙湾坐 15 路公交 40 分钟。",
        "stay_info": "住大东海或亚龙湾（约 500 元/晚），前者方便、后者水质好。",
        "tips": "① 早上水最清，中午别下水\n② 防晒要防水型，不然白涂\n③ 出租车会绕路，用打车软件",
        "media": [
            (P + "demo_7293bdd8fedb3c89.jpg", "三亚 · 亚龙湾"),
            (P + "demo_f2ed3d3cd10e319f.jpg", "三亚 · 海"),
        ],
        "route": {
            "id": "rt_demo_b1c0a00b",
            "title": "三亚四日：大东海 + 亚龙湾",
            "summary": "大东海 → 亚龙湾 → 蜈支洲岛，四天都在海边。",
            "points": [("三亚", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 大东海",
                "content": (
                    "落地先住大东海，出门走五分钟就是沙滩，不用门票。\n"
                    "傍晚沿海边走，晚上第一市场买海鲜加工，人均 100 元。\n"
                    "太阳落山后沙滩上还有人游泳。"
                ),
                "transport": "打车",
                "cost": "约 900 元",
            },
            {
                "title": "第 2—3 天 · 亚龙湾",
                "content": (
                    "15 路公交 40 分钟到亚龙湾，沙滩公共入口在酒店群中间。\n"
                    "浮潜 150 元含装备，早上水最清；中午回去睡一觉，四点后再来。\n"
                    "晚上在附近吃椰子鸡，人均 120 元。"
                ),
                "transport": "公交",
                "cost": "约 1900 元",
            },
            {
                "title": "第 4 天 · 蜈支洲岛",
                "content": (
                    "上岛船票 136 元含往返，八点的第一班人最少。\n"
                    "岛上一圈走完两小时，浮潜和潜水都在这边更值。\n"
                    "下午下岛，赶晚上的飞机。"
                ),
                "transport": "船 + 打车",
                "cost": "约 1000 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a00c",
        "user_id": "usr_c8c1a6ccab",
        "title": "广州三日：糖水铺和早茶",
        "subtitle": "3 天 2 晚，两个人人均 1600 元，一半花在吃上",
        "destination": "广州",
        "day_count": 3,
        "budget": "人均 1600 元（吃 900 + 住宿 500 + 交通 200）",
        "best_season": "10—12 月",
        "summary": (
            "先说数：3 天 2 晚，两个人，人均 1600 元——其中 900 元花在吃上。\n"
            "路线：早茶 → 沙面 → 广州塔，行程表上大部分是餐厅。\n"
            "我的走法是早晚出门、中午躲进糖水铺。\n"
            "11 月去的，不热了，正好逛街。"
        ),
        "transport_info": "白云机场坐地铁 3 号线进城 50 分钟；市区地铁密，基本不用打车。",
        "stay_info": "住珠江新城或北京路（约 350 元/晚），晚上出门就是江边。",
        "tips": "① 早茶要 8 点前去，九点后排队一小时\n② 糖水铺晚上十点还在排队\n③ 广州塔登塔票网上买，现场贵",
        "media": [
            (P + "demo_ca10289305677d2d.jpg", "广州 · 广州塔"),
            (P + "demo_a03ddf67bc9392d3.jpg", "广州 · 糖水"),
        ],
        "route": {
            "id": "rt_demo_b1c0a00c",
            "title": "广州三日：吃为主",
            "summary": "早茶 → 沙面 → 广州塔，三天里大部分时间在吃。",
            "points": [("广州", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 早茶 / 沙面",
                "content": (
                    "早上 7 点半去老字号喝早茶，虾饺、凤爪、肠粉，人均 60 元。\n"
                    "上午沙面岛走走，老洋房一排排，不要门票。\n"
                    "下午躲进糖水铺：双皮奶 12 元、姜撞奶 15 元。"
                ),
                "transport": "地铁 + 步行",
                "cost": "约 500 元",
            },
            {
                "title": "第 2 天 · 广州塔 / 珠江",
                "content": (
                    "白天北京路逛，下午回酒店睡一觉。\n"
                    "傍晚到花城广场，在对岸看广州塔的夜景就够了，不用登塔。\n"
                    "塔下糖水铺晚上 10 点还排队，人均 20 元吃到舒服。"
                ),
                "transport": "地铁",
                "cost": "约 600 元",
            },
            {
                "title": "第 3 天 · 陈家祠",
                "content": (
                    "陈家祠门票 10 元，砖雕和木雕值得细看，一小时够。\n"
                    "中午上下九吃一碗云吞面 15 元，下午去机场。"
                ),
                "transport": "地铁",
                "cost": "约 500 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a00d",
        "user_id": "usr_ac937bb031",
        "title": "纽约五日：时代广场和地铁",
        "subtitle": "5 天 4 晚，一个人 16800 元，地铁比打车快",
        "destination": "纽约",
        "day_count": 4,
        "budget": "人均 16800 元（机票 7000 + 住宿 7000 + 吃 2000 + 交通与门票 800）",
        "best_season": "5 月 / 10 月",
        "summary": (
            "先说数：5 天 4 晚，一个人，总共 16800 元（含往返机票 7000）。\n"
            "路线：曼哈顿中城 → 下城 → 布鲁克林，基本靠地铁。\n"
            "我的走法是白天逛公园、晚上看灯，地铁比打车快。\n"
            "10 月去的，白天 18 度，晚上风大。"
        ),
        "transport_info": "肯尼迪机场坐 AirTrain + 地铁 60 分钟进城；市内地铁 24 小时，比打车快。",
        "stay_info": "住曼哈顿中城偏西（约 180 美元/晚），离地铁近最重要。",
        "tips": "① 地铁比打车快，别在广场中间打车\n② 餐厅小费 15%—20%，刷卡机上直接选\n③ 人多的地方包背前面",
        "media": [
            (P + "demo_40874fec27c6c0aa.jpg", "纽约 · 时代广场"),
            (P + "demo_c45c633ef0dbcd74.jpg", "纽约 · 街头"),
        ],
        "route": {
            "id": "rt_demo_b1c0a00d",
            "title": "纽约五日：中城到下城",
            "summary": "时代广场 → 中央公园 → 下城 → 布鲁克林，靠地铁串起来。",
            "points": [("纽约", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 时代广场",
                "content": (
                    "晚上 8 点最亮，人也是最多的，广告牌一分钟换十几次。\n"
                    "附近没有便宜的吃的，一份热狗 8 美元，站着看二十分钟脖子就酸了。\n"
                    "想拍全屏就退到 42 街那一侧。"
                ),
                "transport": "地铁",
                "cost": "约 3000 元",
            },
            {
                "title": "第 2 天 · 中央公园 / 大都会",
                "content": (
                    "上午中央公园走一段，从 59 街进、72 街出。\n"
                    "下午大都会博物馆，门票 30 美元，一天根本看不完，挑两个馆。\n"
                    "晚上去百老汇看一场，最便宜的站票 40 美元。"
                ),
                "transport": "地铁",
                "cost": "约 3800 元",
            },
            {
                "title": "第 3 天 · 下城",
                "content": (
                    "自由女神像坐渡轮，往返 25 美元，提前订。\n"
                    "华尔街、世贸遗址都在附近，走路能串起来。\n"
                    "傍晚去布鲁克林大桥走一段，对岸拍曼哈顿天际线最好。"
                ),
                "transport": "地铁 + 渡轮",
                "cost": "约 3200 元",
            },
            {
                "title": "第 4—5 天 · 博物馆 / 返程",
                "content": (
                    "现代艺术博物馆 30 美元，周五下午免费。\n"
                    "最后一天上午去高线公园，免费的，走过去 20 分钟。\n"
                    "提前三小时去机场，肯尼迪安检队很长。"
                ),
                "transport": "地铁",
                "cost": "约 6800 元",
            },
        ],
    },
    {
        "id": "tg_demo_b1c0a00e",
        "user_id": "usr_ac937bb031",
        "title": "曼谷四日：大皇宫的金",
        "subtitle": "4 天 3 晚，两个人人均 4200 元，清早出门中午躲太阳",
        "destination": "曼谷",
        "day_count": 4,
        "budget": "人均 4200 元（机票 2000 + 住宿 1200 + 吃 600 + 门票 400）",
        "best_season": "11—2 月",
        "summary": (
            "先说数：4 天 3 晚，两个人，人均 4200 元（含往返机票 2000）。\n"
            "路线：大皇宫 → 卧佛寺 → 暹罗商圈，前两天走老城，后面逛街。\n"
            "我的走法是清早去大皇宫，中午回酒店躲太阳。\n"
            "2 月去的，白天 33 度，一年里最舒服的一段。"
        ),
        "transport_info": "素万那普机场坐机场快线 30 分钟进城；市内有 BTS 和湄南河船。",
        "stay_info": "住考山路或暹罗（约 900 泰铢/晚），前者离大皇宫近。",
        "tips": "① 大皇宫必须穿长裤长袖，别穿拖鞋\n② 门口租纱笼 200 泰铢，别信更贵的\n③ 打车用软件，路边车基本不打表",
        "media": [
            (P + "demo_e08f5e83978a3efa.jpg", "曼谷 · 大皇宫"),
            (P + "demo_c611765037422d49.jpg", "曼谷 · 金顶"),
        ],
        "route": {
            "id": "rt_demo_b1c0a00e",
            "title": "曼谷四日：老城到暹罗",
            "summary": "大皇宫 → 卧佛寺 → 郑王庙 → 暹罗商圈，前两天老城后两天逛街。",
            "points": [("曼谷", None)],
        },
        "days": [
            {
                "title": "第 1 天 · 大皇宫 / 卧佛寺",
                "content": (
                    "8:30 开门就进，门票 500 泰铢，比中午凉快太多。\n"
                    "里面必须穿长裤，门口租纱笼 200 泰铢；卧佛寺在隔壁，可以连着逛。\n"
                    "金顶在太阳底下晃眼，手机自动压暗都拍不出那个颜色。"
                ),
                "transport": "船 + 步行",
                "cost": "约 1200 元",
            },
            {
                "title": "第 2 天 · 湄南河 / 郑王庙",
                "content": (
                    "坐船过河到郑王庙，门票 100 泰铢，塔上台阶很陡。\n"
                    "中午回酒店躲太阳，四点再出门。\n"
                    "晚上考山路吃路边摊，一份 Pad Thai 60 泰铢。"
                ),
                "transport": "船",
                "cost": "约 900 元",
            },
            {
                "title": "第 3 天 · 暹罗商圈",
                "content": (
                    "BTS 到暹罗，几个商场连在一起，空调很足。\n"
                    "中午在商场里吃，人均 200 泰铢；下午做一次泰式按摩，300 泰铢一小时。\n"
                    "晚上去火车夜市，吃的比商场便宜一半。"
                ),
                "transport": "BTS",
                "cost": "约 1100 元",
            },
            {
                "title": "第 4 天 · 返程",
                "content": (
                    "上午再去一趟大皇宫附近的码头，坐船看看河。\n"
                    "中午退房，机场快线 30 分钟到素万那普。\n"
                    "提前三小时到机场，退税在出发层办。"
                ),
                "transport": "船 + 机场快线",
                "cost": "约 1000 元",
            },
        ],
    },
]


# 现有攻略里漏掉的地名：地图上的「丽江古城」其实是滇西北环线的必经点，
# 但那一天的正文只写了香格里拉，补一句让它也能对上出处（整段赋值，幂等）。
DAY_SUPPLEMENTS: dict[str, str] = {
    "gd_b893445564": (
        "松赞林寺早上 8 点去，诵经声一层层传下来，门票 90 元含讲解。\n"
        "普达措 258 元含观光车，海拔 3800，慢慢走别跑。\n"
        "回程顺路去纳帕海，草原上骑马 60 元一圈，可以砍价。\n"
        "回丽江的路上在束河停一晚，比大研安静，早上石板路上没人。"
    ),
}


def _coords(name: str, location_id: str | None, db) -> tuple[float | None, float | None]:
    if location_id:
        loc = db.get(Location, location_id)
        if loc and loc.latitude and loc.longitude:
            return loc.latitude, loc.longitude
    found = city_coords.lookup_coords(name)
    if found:
        return found[0], found[1]
    return None, None


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        for spec in GUIDES:
            gid = spec["id"]
            route_spec = spec.get("route")

            # ---- 幂等清理 ----
            db.query(GuideDay).filter(GuideDay.guide_id == gid).delete(synchronize_session=False)
            db.query(GuideMedia).filter(GuideMedia.guide_id == gid).delete(synchronize_session=False)
            db.query(TravelGuide).filter(TravelGuide.id == gid).delete(synchronize_session=False)
            if route_spec:
                rid = route_spec["id"]
                db.query(RoutePoint).filter(RoutePoint.route_id == rid).delete(synchronize_session=False)
                db.query(TravelRoute).filter(TravelRoute.id == rid).delete(synchronize_session=False)

            # ---- 路线 ----
            if route_spec:
                db.add(
                    TravelRoute(
                        id=route_spec["id"],
                        user_id=spec["user_id"],
                        title=route_spec["title"],
                        summary=route_spec.get("summary"),
                        cover=spec["media"][0][0] if spec.get("media") else None,
                        start_date=None,
                        end_date=None,
                        tags=json.dumps([spec["destination"]], ensure_ascii=False),
                        visibility=spec.get("visibility", "public"),
                    )
                )
                for i, (name, loc_id) in enumerate(route_spec["points"]):
                    lat, lng = _coords(name, loc_id, db)
                    db.add(
                        RoutePoint(
                            route_id=route_spec["id"],
                            sort=i,
                            name=name,
                            location_id=loc_id,
                            latitude=lat,
                            longitude=lng,
                            stay_days=1,
                            transport=None,
                            note=None,
                        )
                    )

            # ---- 攻略 ----
            media = spec.get("media") or []
            db.add(
                TravelGuide(
                    id=gid,
                    user_id=spec["user_id"],
                    title=spec["title"],
                    subtitle=spec.get("subtitle"),
                    cover=media[0][0] if media else None,
                    destination=spec["destination"],
                    day_count=spec.get("day_count") or len(spec["days"]),
                    budget=spec.get("budget"),
                    best_season=spec.get("best_season"),
                    transport_info=spec.get("transport_info"),
                    stay_info=spec.get("stay_info"),
                    summary=spec.get("summary"),
                    tips=spec.get("tips"),
                    route_id=route_spec["id"] if route_spec else None,
                    visibility=spec.get("visibility", "public"),
                    status="published",
                )
            )
            for i, day in enumerate(spec["days"]):
                db.add(
                    GuideDay(
                        id="gd_" + uuid.uuid4().hex[:10],
                        guide_id=gid,
                        sort=i,
                        title=day["title"],
                        content=day["content"],
                        image_url=day.get("image_url") or (media[i % len(media)][0] if media else None),
                        transport=day.get("transport"),
                        cost=day.get("cost"),
                    )
                )
            for i, (url, caption) in enumerate(media):
                db.add(GuideMedia(guide_id=gid, url=url, caption=caption, sort=i))

            print(f"[写入] {gid}  {spec['title']}  ({len(spec['days'])} 天)")

        for day_id, content in DAY_SUPPLEMENTS.items():
            day = db.get(GuideDay, day_id)
            if day:
                day.content = content
                print(f"[补充] {day_id} 补上了漏掉的地名")

        db.commit()
        print(f"[完成] 补了 {len(GUIDES)} 篇攻略 + 对应的路线")
    finally:
        db.close()


if __name__ == "__main__":
    main()
