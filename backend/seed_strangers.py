"""灌一批「陌生人」演示数据：旅行博主账号 + 景点照片 + 路线 + 攻略

    python seed_strangers.py            # 缺什么补什么（可重复跑）
    python seed_strangers.py --refresh  # 忽略已存在，重新灌一遍

图片来自 Wikimedia Commons（自由授权），下载失败时自动生成一张带地名的占位图。
"""
import os
import io
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from hashlib import sha1

import city_coords
from auth import hash_password, new_salt
from config import MEDIA_DIR
from db import SessionLocal, init_db
from models import (
    Friendship,
    FriendRequest,
    GuideDay,
    GuideMedia,
    Location,
    Memory,
    MemoryMedia,
    RoutePoint,
    TravelGuide,
    TravelRoute,
    User,
)

UA = {"User-Agent": "ShiguangDemo/1.0 (local demo data)"}
UPLOAD_DIR = MEDIA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- 景点表
# 城市, 地点名, Commons 搜索词
SPOTS: dict[str, tuple[str, str, str]] = {
    "xihu": ("杭州", "西湖", "West Lake Hangzhou"),
    "gugong": ("北京", "故宫", "Forbidden City Beijing"),
    "changcheng": ("北京", "慕田峪长城", "Great Wall Mutianyu"),
    "waitan": ("上海", "外滩", "The Bund Shanghai"),
    "bingmayong": ("西安", "兵马俑", "Terracotta Army"),
    "kuanzhai": ("成都", "宽窄巷子", "Chengdu old street"),
    "hongyadong": ("重庆", "洪崖洞", "Chongqing night skyline"),
    "zhangjiajie": ("张家界", "天门山", "Zhangjiajie"),
    "jiuzhaigou": ("九寨沟", "五花海", "Jiuzhaigou lake"),
    "mogaoku": ("敦煌", "莫高窟", "Mogao Caves"),
    "lijiang": ("丽江", "丽江古城", "Lijiang Old Town"),
    "lijiang_river": ("桂林", "漓江", "Li River Guilin"),
    "huangshan": ("黄山", "黄山云海", "Huangshan sea of clouds"),
    "gulangyu": ("厦门", "鼓浪屿", "Gulangyu Xiamen"),
    "zhanqiao": ("青岛", "栈桥", "Zhanqiao Pier Qingdao"),
    "yalongwan": ("三亚", "亚龙湾", "Yalong Bay Sanya"),
    "budala": ("拉萨", "布达拉宫", "Potala Palace"),
    "hulunbuir": ("呼伦贝尔", "呼伦贝尔草原", "Hulunbuir grassland"),
    "qinghaihu": ("青海湖", "青海湖", "Qinghai Lake"),
    "taishan": ("泰安", "泰山日出", "Mount Tai"),
    "zhuozhengyuan": ("苏州", "拙政园", "Humble Administrator Garden Suzhou"),
    "fuzimiao": ("南京", "夫子庙秦淮河", "Qinhuai River Nanjing"),
    "huanghelou": ("武汉", "黄鹤楼", "Yellow Crane Tower"),
    "guangzhouta": ("广州", "广州塔", "Canton Tower"),
    "suofeiya": ("哈尔滨", "圣索菲亚教堂", "Saint Sophia Cathedral Harbin"),
    "erhai": ("大理", "洱海", "Erhai Lake Dali"),
    "songzanlin": ("香格里拉", "松赞林寺", "Songzanlin Monastery"),
    "taipei101": ("台北", "台北 101", "Taipei 101"),
    "qiansicao": ("东京", "浅草寺", "Sensoji Temple"),
    "fushimi": ("京都", "伏见稻荷大社", "Fushimi Inari Taisha"),
    "osakacastle": ("大阪", "大阪城", "Osaka Castle"),
    "jingfugong": ("首尔", "景福宫", "Gyeongbokgung"),
    "dahuanggong": ("曼谷", "大皇宫", "Grand Palace Bangkok"),
    "marinabay": ("新加坡", "滨海湾", "Marina Bay Sands"),
    "aifeier": ("巴黎", "埃菲尔铁塔", "Eiffel Tower"),
    "doushou": ("罗马", "斗兽场", "Colosseum Rome"),
    "lunduntaqiao": ("伦敦", "伦敦塔桥", "Tower Bridge London"),
    "shidaiguangchang": ("纽约", "时代广场", "Times Square New York"),
}

# ---------------------------------------------------------------- 陌生人（12 个）
# spots 里每项：(spot key, 标题, 一句话, 日期, 标签)
STRANGERS = [
    {
        "username": "wander_lin", "nickname": "林走走", "home_city": "上海",
        "bio": "一个人走了 20 座城，习惯在陌生城市早起。",
        "spots": [
            ("xihu", "清晨六点的西湖", "断桥没有人，只有扫地的师傅和我。", "2025-04-06", ["旅行", "清晨"]),
            ("zhuozhengyuan", "在拙政园躲了一场雨", "雨点打在荷叶上，比任何音乐都好听。", "2025-04-08", ["旅行", "下雨"]),
            ("waitan", "外滩的风比想象中大", "从十六铺一路走到外白渡桥，鞋都湿了。", "2024-11-02", ["旅行", "夜"]),
        ],
        "route": ("沪苏杭四日慢走", "城市之间坐高铁，市内全靠走。", "2025-04-05", "2025-04-09", ["高铁", "城市漫步"],
                  [("上海", 1, None, "先在外滩吹风"), ("苏州", 1, "高铁", "园林和面馆"), ("杭州", 2, "高铁", "西湖绕半圈")]),
        "guide": ("沪苏杭四日：不赶景点版", "三天走完，脚不废",
                  "上海 · 苏州 · 杭州", "人均 1500 元", "4 月",
                  "三城之间高铁都在一小时左右，买早班车人少。",
                  "上海住南京东路，苏州住观前街，杭州住龙翔桥附近，出门就是地铁。",
                  "不追网红点，每天只定一个必须去的地方，剩下的随缘。",
                  "西湖边的游船贵，走到杨公堤反而清净。",
                  [("第 1 天 · 上海", "外滩 → 十六铺 → 南京东路", "步行", "约 300 元"),
                   ("第 2 天 · 苏州", "拙政园 → 平江路 → 观前街", "高铁", "约 500 元"),
                   ("第 3—4 天 · 杭州", "西湖 → 灵隐寺 → 龙井村", "高铁", "约 700 元")]),
    },
    {
        "username": "chen_ontheroad", "nickname": "陈在路上", "home_city": "成都",
        "bio": "自驾党。喜欢没有信号的路。",
        "spots": [
            ("erhai", "环洱海骑了一整天", "风大到听不见自己说话。", "2026-03-10", ["自驾", "湖"]),
            ("songzanlin", "松赞林寺的早上", "诵经声比闹钟管用。", "2026-03-13", ["寺庙", "清晨"]),
            ("qinghaihu", "青海湖的蓝有点假", "照片不用调色。", "2025-07-18", ["自驾", "湖"]),
        ],
        "route": ("滇西北环线 6 天", "昆明取车，一路往北，海拔慢慢升。", "2026-03-08", "2026-03-14", ["自驾", "高原"],
                  [("昆明", 1, None, "落地休整"), ("大理", 2, "自驾", "环洱海"), ("香格里拉", 2, "自驾", "松赞林寺")]),
        "guide": ("滇西北自驾 6 天", "先把海拔升上来",
                  "昆明 · 大理 · 香格里拉", "人均 3200 元", "3—5 月",
                  "昆明取车最便宜；大理到香格里拉走高速 4 小时，服务区能看雪山。",
                  "大理住才村码头，香格里拉住独克宗古城里，晚上不用打车。",
                  "第一次上高原，别把香格里拉放在第一天。",
                  "环洱海别逆时针，下午的光全在对面。",
                  [("第 1 天 · 昆明", "取车 + 翠湖公园", "自驾", "约 400 元"),
                   ("第 2—3 天 · 大理", "环洱海 + 喜洲古镇", "自驾", "约 1000 元"),
                   ("第 4—6 天 · 香格里拉", "松赞林寺 + 普达措", "自驾", "约 1800 元")]),
    },
    {
        "username": "mika_travels", "nickname": "Mika", "home_city": "广州",
        "bio": "拍风景也拍自己，一年换一次相机。",
        "spots": [
            ("qiansicao", "浅草寺抽到了大吉", "把签系在架子上，又被风吹开了。", "2025-11-20", ["旅行", "日本"]),
            ("fushimi", "伏见稻荷的千本鸟居", "下午四点后人少一半。", "2025-11-23", ["旅行", "日本"]),
            ("taishan", "在泰山等日出", "零下五度，手抖得按不准快门。", "2024-10-03", ["山", "日出"]),
        ],
        "route": ("关西五日：京都 + 大阪", "不赶，一天两个点。", "2025-11-20", "2025-11-24", ["日本", "铁道"],
                  [("东京", 2, None, "浅草寺、下町散步"), ("京都", 2, "新干线", "伏见稻荷、祇园"), ("大阪", 1, "电车", "大阪城")]),
        "guide": ("第一次去关西怎么排", "别把行程塞满",
                  "东京 · 京都 · 大阪", "人均 6800 元", "11 月",
                  "东京到京都新干线 2 小时 15 分，指定席早点买；市内用地铁一日券。",
                  "京都住四条河原町，大阪住难波，晚上找吃的方便。",
                  "关西的红叶十一月下旬最好，但人多到走不动。",
                  "伏见稻荷想拍空景，早上七点前到。",
                  [("第 1—2 天 · 东京", "浅草寺 + 台场", "地铁", "约 2000 元"),
                   ("第 3—4 天 · 京都", "伏见稻荷 + 清水寺", "新干线", "约 2600 元"),
                   ("第 5 天 · 大阪", "大阪城 + 道顿堀", "电车", "约 1200 元")]),
    },
    {
        "username": "laohei", "nickname": "老黑", "home_city": "郑州",
        "bio": "坐硬座穿越中国，最长一次 38 小时。",
        "spots": [
            ("changcheng", "慕田峪的风把帽子吹走了", "捡回来的时候已经滚到第三个烽火台。", "2024-09-21", ["旅行", "长城"]),
            ("huanghelou", "黄鹤楼上看长江", "第一次觉得「烟波江上」写得真准。", "2025-03-15", ["旅行", "江"]),
            ("fuzimiao", "秦淮河的夜里全是人", "船票贵，站着看反而最好。", "2025-03-17", ["旅行", "夜"]),
        ],
        "route": ("京汉宁三城硬座记", "火车上睡两晚，省下两晚房费。", "2025-03-14", "2025-03-18", ["火车", "穷游"],
                  [("北京", 2, None, "长城 + 胡同"), ("武汉", 1, "硬卧", "黄鹤楼、江汉路"), ("南京", 1, "动车", "秦淮河")]),
        "guide": ("硬座穷游三城", "总花费不到 1200",
                  "北京 · 武汉 · 南京", "人均 1150 元", "3—5 月",
                  "夜车省住宿，但记得买硬卧下铺；三城之间都有直达。",
                  "青年旅舍比酒店有意思，但别选火车站旁边那种。",
                  "这个行程适合时间多、预算少的人。",
                  "秦淮河游船可以省，站桥上看得更全。",
                  [("第 1—2 天 · 北京", "慕田峪长城 + 南锣鼓巷", "公交", "约 400 元"),
                   ("第 3 天 · 武汉", "黄鹤楼 + 户部巷", "硬卧", "约 350 元"),
                   ("第 4—5 天 · 南京", "夫子庙 + 老门东", "动车", "约 400 元")]),
    },
    {
        "username": "xiaoyu_sea", "nickname": "小雨", "home_city": "厦门",
        "bio": "只去有海的地方。",
        "spots": [
            ("gulangyu", "鼓浪屿的老别墅", "岛上的猫比游客淡定。", "2025-06-11", ["海边", "旅行"]),
            ("yalongwan", "亚龙湾的水清到不真实", "浮潜看到一条小丑鱼。", "2026-01-20", ["海边", "浮潜"]),
            ("zhanqiao", "青岛栈桥喂海鸥", "面包刚举起来就被抢走了。", "2024-12-28", ["海边", "冬天"]),
        ],
        "route": ("闽南海边三日", "厦门 + 鼓浪屿，不赶路。", "2025-06-10", "2025-06-12", ["海边", "慢"],
                  [("厦门", 2, None, "环岛路骑车"), ("鼓浪屿", 1, "轮渡", "老别墅与猫")]),
        "guide": ("厦门 + 鼓浪屿三日", "轮渡要提前订",
                  "厦门 · 鼓浪屿", "人均 1400 元", "6 月 / 11 月",
                  "鼓浪屿轮渡必须提前一天网上订，码头选邮轮中心；岛上没有车，全靠走。",
                  "住沙坡尾或曾厝垵，出门就是海。",
                  "岛上的网红店排队久，小吃摊反而更实在。",
                  "环岛路傍晚骑行最好，白天太晒。",
                  [("第 1 天 · 厦门", "环岛路 + 沙坡尾", "步行", "约 400 元"),
                   ("第 2 天 · 鼓浪屿", "日光岩 + 老别墅群", "轮渡", "约 600 元"),
                   ("第 3 天 · 厦门", "南普陀 + 曾厝垵", "公交", "约 400 元")]),
    },
    {
        "username": "old_camera", "nickname": "老相机", "home_city": "南京",
        "bio": "只拍胶片，一年 20 卷。",
        "spots": [
            ("huangshan", "黄山等云海等了三天", "第三天早上终于来了。", "2025-05-02", ["山", "云海"]),
            ("mogaoku", "莫高窟的第九窟", "讲解员说这面墙比欧洲中世纪还早。", "2024-06-14", ["历史", "敦煌"]),
            ("hulunbuir", "草原上没有尽头", "开了两小时没看到一棵树。", "2025-08-09", ["草原", "自驾"]),
        ],
        "route": ("河西走廊七日", "兰州往西，一路到敦煌。", "2024-06-10", "2024-06-16", ["自驾", "历史"],
                  [("兰州", 1, None, "牛肉面开局"), ("张掖", 2, "动车", "丹霞"), ("敦煌", 3, "动车", "莫高窟、鸣沙山")]),
        "guide": ("河西走廊七日", "一条路看完两千年",
                  "兰州 · 张掖 · 敦煌", "人均 3600 元", "6 月 / 9 月",
                  "兰州到张掖、敦煌都有动车，比自驾省心；敦煌市内打车很便宜。",
                  "敦煌住沙州夜市附近，晚上有得吃。",
                  "莫高窟必须提前预约，普通票只能看 8 个窟。",
                  "鸣沙山傍晚去，白天晒得走不动。",
                  [("第 1 天 · 兰州", "中山桥 + 正宁路夜市", "动车", "约 400 元"),
                   ("第 2—3 天 · 张掖", "七彩丹霞 + 马蹄寺", "动车", "约 900 元"),
                   ("第 4—7 天 · 敦煌", "莫高窟 + 鸣沙山 + 雅丹", "动车", "约 2300 元")]),
    },
    {
        "username": "yuki_jp", "nickname": "Yuki", "home_city": "东京",
        "bio": "在日本住了八年，还是喜欢当游客。",
        "spots": [
            ("taipei101", "台北 101 的跨年", "挤到抬不起手拍照。", "2025-12-31", ["跨年", "城市"]),
            ("osakacastle", "大阪城公园的樱花", "树下全是野餐布。", "2025-04-02", ["樱花", "日本"]),
            ("jingfugong", "景福宫穿韩服免票", "租衣服比门票还便宜。", "2024-10-12", ["韩国", "宫殿"]),
        ],
        "route": ("日韩台五城跳岛", "机票便宜的时候连着飞。", "2025-04-01", "2025-04-12", ["飞机", "城市"],
                  [("大阪", 3, None, "樱花季"), ("首尔", 2, "飞机", "宫殿与咖啡"), ("台北", 3, "飞机", "夜市")]),
        "guide": ("日韩台三地十二天", "怎么买机票最省",
                  "大阪 · 首尔 · 台北", "人均 9800 元", "4 月",
                  "大阪—首尔—台北这条线常有廉航特价，提前两个月看。",
                  "每城住地铁两站内，行李寄存站内柜子。",
                  "十二天三地其实偏赶，能少一地就少一地。",
                  "樱花季酒店涨价夸张，早点订。",
                  [("第 1—3 天 · 大阪", "大阪城 + 造币局樱花", "地铁", "约 3000 元"),
                   ("第 4—5 天 · 首尔", "景福宫 + 汉江", "飞机", "约 2800 元"),
                   ("第 6—12 天 · 台北", "101 + 九份 + 夜市", "飞机", "约 4000 元")]),
    },
    {
        "username": "sky_gao", "nickname": "高远", "home_city": "西宁",
        "bio": "追星空的人，车里常年放着三脚架。",
        "spots": [
            ("qinghaihu", "青海湖边的银河", "凌晨两点，冷到手机自动关机。", "2025-07-20", ["星空", "湖"]),
            ("budala", "布达拉宫的第一眼", "在药王山观景台站了很久。", "2024-08-05", ["高原", "信仰"]),
            ("zhangjiajie", "天门山的云在脚下", "玻璃栈道没想象中可怕。", "2025-05-18", ["山", "云雾"]),
        ],
        "route": ("青藏线进藏 8 天", "火车进，飞机出。", "2024-08-01", "2024-08-08", ["火车", "高原"],
                  [("西宁", 2, None, "青海湖 + 星空"), ("拉萨", 5, "火车", "布达拉宫、大昭寺"), ("纳木错", 1, "包车", "圣湖")]),
        "guide": ("青藏线进藏 8 天", "海拔要一天一天上",
                  "西宁 · 拉萨 · 纳木错", "人均 5200 元", "7—8 月",
                  "西宁坐 Z 字头火车进藏，24 小时，沿途风景比飞机值。",
                  "拉萨住八廓街附近，出门就能转经。",
                  "第一天到拉萨什么都别做，躺着。",
                  "纳木错海拔 4700，别过夜。",
                  [("第 1—2 天 · 西宁", "青海湖 + 茶卡", "包车", "约 1200 元"),
                   ("第 3—7 天 · 拉萨", "布达拉宫 + 大昭寺 + 八廓街", "火车", "约 3000 元"),
                   ("第 8 天 · 纳木错", "圣湖一日往返", "包车", "约 1000 元")]),
    },
    {
        "username": "tina_food", "nickname": "Tina", "home_city": "长沙",
        "bio": "为了吃去一座城，行程表上只有餐厅。",
        "spots": [
            ("kuanzhai", "宽窄巷子边上的苍蝇馆子", "比景区里好吃十倍。", "2025-09-12", ["美食", "成都"]),
            ("hongyadong", "洪崖洞的夜景配小面", "凌晨一点还在排队。", "2025-09-14", ["美食", "夜"]),
            ("guangzhouta", "广州塔下的糖水铺", "双皮奶救活了走不动的我。", "2024-07-08", ["美食", "城市"]),
        ],
        "route": ("成渝四日吃货线", "一天五顿，走到哪吃到哪。", "2025-09-11", "2025-09-15", ["美食", "高铁"],
                  [("成都", 2, None, "玉林路 + 宽窄巷子"), ("重庆", 2, "高铁", "洪崖洞 + 解放碑")]),
        "guide": ("成渝四日吃货路线", "一天五顿怎么排",
                  "成都 · 重庆", "人均 2200 元", "9—11 月",
                  "成都东到重庆北高铁 1 小时 20 分，班次很多。",
                  "成都住玉林，重庆住解放碑，都是步行觅食区。",
                  "把胃分成四份，别在第一顿就吃饱。",
                  "洪崖洞里的餐厅贵且一般，去对岸吃。",
                  [("第 1—2 天 · 成都", "玉林路 + 建设巷 + 宽窄巷子", "步行", "约 1000 元"),
                   ("第 3—4 天 · 重庆", "洪崖洞 + 观音桥 + 小面", "高铁", "约 1200 元")]),
    },
    {
        "username": "peng_peng", "nickname": "鹏鹏", "home_city": "深圳",
        "bio": "带着爸妈旅行，行程要慢、要有电梯。",
        "spots": [
            ("jiuzhaigou", "五花海的颜色像假的", "爸妈第一次见到这种蓝。", "2024-10-18", ["家人", "水"]),
            ("lijiang", "丽江古城住了一周", "每天就是晒太阳喝茶。", "2025-02-11", ["家人", "慢"]),
            ("lijiang_river", "漓江坐竹筏", "船工唱了一段山歌。", "2024-04-22", ["家人", "江"]),
        ],
        "route": ("桂林阳朔五日轻松版", "全程有电梯，每天不超过两小时车程。", "2024-04-20", "2024-04-24", ["家人", "慢"],
                  [("桂林", 2, None, "象鼻山、两江四湖"), ("阳朔", 3, "大巴", "漓江竹筏、遇龙河")]),
        "guide": ("带爸妈去桂林阳朔", "行程要留白",
                  "桂林 · 阳朔", "人均 2600 元", "4 月 / 10 月",
                  "桂林到阳朔坐大巴或游船都行，游船四小时，适合长辈。",
                  "阳朔住西街外一公里，安静又不远。",
                  "每天安排两件事就够了，多了老人会累。",
                  "竹筏选遇龙河，比漓江大船舒服。",
                  [("第 1—2 天 · 桂林", "象鼻山 + 两江四湖夜游", "步行", "约 1000 元"),
                   ("第 3—5 天 · 阳朔", "漓江 + 遇龙河 + 十里画廊", "大巴", "约 1600 元")]),
    },
    {
        "username": "zhou_mountain", "nickname": "周山", "home_city": "昆明",
        "bio": "爬了十年山，目标是中国的五岳。",
        "spots": [
            ("taishan", "泰山十八盘", "数着台阶上去的，一共 1633 级。", "2025-10-01", ["山", "五岳"]),
            ("huangshan", "黄山的松树", "长在石头缝里，比人倔。", "2024-11-11", ["山", "松"]),
            ("zhangjiajie", "张家界的石柱", "像有人把山劈成了筷子。", "2023-09-09", ["山", "石"]),
        ],
        "route": ("五岳打卡计划 · 泰山", "夜爬，看日出。", "2025-09-30", "2025-10-02", ["山", "日出"],
                  [("泰安", 2, None, "夜爬泰山")]),
        "guide": ("夜爬泰山看日出", "几点出发最合适",
                  "泰安 · 泰山", "人均 900 元", "9—10 月",
                  "泰山站下车打车到红门 15 分钟；也可以坐天外村大巴到中天门。",
                  "山上住一晚太贵，多数人选择夜爬。",
                  "晚上十点从红门出发，四点前到南天门刚好。",
                  "山上风大，冲锋衣必带，山顶租大衣 30 元。",
                  [("第 1 天 · 泰安", "岱庙 + 老街", "步行", "约 300 元"),
                   ("第 2 天 · 泰山", "夜爬 + 日出 + 下山", "步行", "约 600 元")]),
    },
    {
        "username": "anna_world", "nickname": "Anna", "home_city": "北京",
        "bio": "在攒第 30 个国家。飞行里程比我走过的路多。",
        "spots": [
            ("aifeier", "埃菲尔铁塔整点闪灯", "第一晚看到的时候真的哇出声。", "2025-06-20", ["欧洲", "城市"]),
            ("doushou", "罗马斗兽场排队两小时", "进去只走了四十分钟，但值。", "2025-06-25", ["欧洲", "历史"]),
            ("lunduntaqiao", "伦敦塔桥开桥", "等了半小时才等到船。", "2024-09-05", ["欧洲", "河"]),
            ("shidaiguangchang", "时代广场的广告牌", "比想象中吵十倍。", "2024-12-30", ["美国", "跨年"]),
            ("marinabay", "滨海湾的灯光秀", "躺在对岸草坪上看完了。", "2025-02-14", ["东南亚", "夜"]),
            ("dahuanggong", "曼谷大皇宫的金", "太阳底下睁不开眼。", "2025-02-10", ["东南亚", "寺庙"]),
        ],
        "route": ("欧洲三城十日", "巴黎进、伦敦出。", "2025-06-19", "2025-06-29", ["飞机", "欧洲"],
                  [("巴黎", 4, None, "铁塔、卢浮宫"), ("罗马", 3, "飞机", "斗兽场、梵蒂冈"), ("伦敦", 3, "飞机", "塔桥、博物馆")]),
        "guide": ("欧洲三城十日怎么排", "别贪多",
                  "巴黎 · 罗马 · 伦敦", "人均 21000 元", "6 月 / 9 月",
                  "三城之间都有廉航，但行李费另算；火车过夜也能省一晚。",
                  "巴黎住玛黑区，罗马住 Termini 附近，伦敦住国王十字。",
                  "十天三城已经很赶，博物馆一天最多两个。",
                  "斗兽场和梵蒂冈都要提前网上订票，现场排队会毁掉一天。",
                  [("第 1—4 天 · 巴黎", "铁塔 + 卢浮宫 + 蒙马特", "地铁", "约 8000 元"),
                   ("第 5—7 天 · 罗马", "斗兽场 + 梵蒂冈", "飞机", "约 7000 元"),
                   ("第 8—10 天 · 伦敦", "塔桥 + 大英博物馆", "飞机", "约 6000 元")]),
    },
]

# 会主动来加你的两个陌生人
REQUESTERS = ("wander_lin", "tina_food")


# ---------------------------------------------------------------- 图片
_IMAGE_CACHE: dict[str, list[str]] = {}


# 主账号：从环境变量读取，仓库里只保留演示默认值
OWNER_USERNAME = os.getenv("DEMO_OWNER_USER", "demo")
OWNER_PASSWORD = os.getenv("DEMO_OWNER_PASS", "demo123456")


def _hash_name(data: bytes, ext: str = ".jpg") -> str:
    return f"demo_{sha1(data).hexdigest()[:16]}{ext}"


def _save_image(data: bytes) -> str:
    name = _hash_name(data)
    path = UPLOAD_DIR / name
    if not path.exists():
        path.write_bytes(data)
    return f"/media/uploads/{name}"


def _placeholder(text: str, idx: int) -> bytes:
    """下载不到就自己画一张带地名的图，保证数据不缺图"""
    from PIL import Image, ImageDraw, ImageFont

    palettes = [
        ((28, 46, 84), (86, 148, 210)),
        ((52, 32, 60), (196, 122, 160)),
        ((24, 58, 52), (96, 190, 150)),
        ((62, 44, 30), (220, 168, 100)),
        ((30, 42, 66), (140, 170, 220)),
    ]
    top, bottom = palettes[idx % len(palettes)]
    w, h = 1400, 933
    img = Image.new("RGB", (w, h), top)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        k = y / h
        draw.line(
            [(0, y), (w, y)],
            fill=(
                int(top[0] + (bottom[0] - top[0]) * k),
                int(top[1] + (bottom[1] - top[1]) * k),
                int(top[2] + (bottom[2] - top[2]) * k),
            ),
        )
    font = None
    for candidate in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        try:
            font = ImageFont.truetype(candidate, 72)
            break
        except Exception:
            continue
    if font:
        box = draw.textbbox((0, 0), text, font=font)
        draw.text(((w - (box[2] - box[0])) / 2, h / 2 - 50), text, font=font, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def _get(url: str, referer: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={**UA, "Referer": referer})
    return urllib.request.urlopen(req, timeout=timeout).read()


def commons_images(query: str, limit: int = 2) -> list[bytes]:
    """Wikimedia Commons：自由授权的景点照片"""
    api = (
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"
        f"&gsrsearch={urllib.parse.quote('filetype:bitmap ' + query)}&gsrlimit={limit * 3}"
        "&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=1400"
    )
    pages = {}
    for attempt in range(3):
        try:
            pages = json.loads(_get(api, "https://commons.wikimedia.org/", 25)).get("query", {}).get("pages", {})
            break
        except Exception as exc:
            if attempt == 2:
                print(f"    [图片] commons 搜索失败 {query}: {type(exc).__name__}")
            time.sleep(1.5)

    out: list[bytes] = []
    for page in list(pages.values()):
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        try:
            data = _get(url, "https://commons.wikimedia.org/")
        except Exception:
            continue
        if len(data) > 40_000:
            out.append(data)
        if len(out) >= limit:
            break
    return out


def so_images(query: str, limit: int = 2) -> list[bytes]:
    """360 图片搜索：commons 找不到时的备选"""
    q = urllib.parse.quote(query)
    api = f"https://image.so.com/j?q={q}&src=srp&correct={q}&sn=0&pn={limit * 4}"
    try:
        data = json.loads(_get(api, "https://image.so.com/", 25).decode("utf-8", "ignore"))
    except Exception as exc:
        print(f"    [图片] 360 搜索失败 {query}: {type(exc).__name__}")
        return []

    out: list[bytes] = []
    for item in data.get("list", []):
        url = item.get("img") or item.get("thumb")
        if not url:
            continue
        try:
            raw = _get(url, "https://image.so.com/")
        except Exception:
            continue
        if len(raw) > 40_000:
            out.append(raw)
        if len(out) >= limit:
            break
    return out


def images_for(key: str, city: str, spot: str, query: str) -> list[str]:
    if key in _IMAGE_CACHE:
        return _IMAGE_CACHE[key]

    datas = commons_images(query, 2)
    if len(datas) < 2:
        datas += so_images(f"{city} {spot} 风景", 2 - len(datas))

    urls = [_save_image(d) for d in datas]
    while len(urls) < 2:
        urls.append(_save_image(_placeholder(f"{city} · {spot}", len(urls) + len(key))))
    _IMAGE_CACHE[key] = urls
    print(f"    [图片] {city}{spot} → {len(datas)} 张真实照片 / 共 {len(urls)} 张")
    return urls


# ---------------------------------------------------------------- 数据写入
def ensure_location(db, city: str, spot: str) -> Location:
    loc_id = "loc_demo_" + sha1(f"{city}{spot}".encode()).hexdigest()[:10]
    loc = db.get(Location, loc_id)
    if loc:
        return loc
    coords = city_coords.lookup_coords(city) or (0.0, 0.0)
    loc = Location(
        id=loc_id, name=spot, city=city, region=None, country="中国" if coords != (0.0, 0.0) else None,
        latitude=coords[0], longitude=coords[1], precision="city",
    )
    db.add(loc)
    db.flush()
    return loc


def ensure_user(db, spec: dict) -> User:
    user = db.query(User).filter(User.username == spec["username"]).first()
    if user:
        return user
    salt = new_salt()
    user = User(
        id="usr_" + uuid.uuid4().hex[:10],
        username=spec["username"],
        nickname=spec["nickname"],
        password_hash=hash_password("123456", salt),
        salt=salt,
        bio=spec["bio"],
        home_city=spec["home_city"],
    )
    db.add(user)
    db.flush()
    return user


def make_memory(db, user: User, spot_key: str, entry, images: list[str]) -> str:
    city, spot, _query = SPOTS[spot_key]
    _key, title, summary, date, tags = entry
    loc = ensure_location(db, city, spot)
    mem_id = f"mem_demo_{uuid.uuid4().hex[:10]}"
    cover = images[0]
    memory = Memory(
        id=mem_id,
        title=title,
        summary=summary,
        content=summary,
        happened_at=f"{date}T10:30:00",
        time_precision="day",
        location_id=loc.id,
        tags=json.dumps(tags, ensure_ascii=False),
        emotion="开心",
        importance=3,
        source_type="photo",
        cover=cover,
        media_count=len(images),
        ai_status="confirmed",
        confidence=0.92,
        ai_generated=False,
        user_id=user.id,
        visibility="public",
    )
    db.add(memory)
    for i, url in enumerate(images):
        db.add(MemoryMedia(memory_id=mem_id, url=url, caption=f"{spot} · {i + 1}", sort=i))
    if not user.avatar:
        user.avatar = cover
    return mem_id


def clean_demo(db) -> None:
    """清掉上次灌进去的演示内容（图片文件留着，按内容哈希命名会自动复用）"""
    from sqlalchemy import delete as sqldelete

    usernames = [s["username"] for s in STRANGERS]
    user_ids = [u.id for u in db.query(User).filter(User.username.in_(usernames)).all()]
    mem_ids = [m.id for m in db.query(Memory).filter(Memory.id.like("mem_demo_%")).all()]
    route_ids = [r.id for r in db.query(TravelRoute).filter(TravelRoute.id.like("rt_demo_%")).all()]
    guide_ids = [g.id for g in db.query(TravelGuide).filter(TravelGuide.id.like("tg_demo_%")).all()]

    if mem_ids:
        db.execute(sqldelete(MemoryMedia).where(MemoryMedia.memory_id.in_(mem_ids)))
        db.execute(sqldelete(Memory).where(Memory.id.in_(mem_ids)))
    if route_ids:
        db.execute(sqldelete(RoutePoint).where(RoutePoint.route_id.in_(route_ids)))
        db.execute(sqldelete(TravelRoute).where(TravelRoute.id.in_(route_ids)))
    if guide_ids:
        db.execute(sqldelete(GuideDay).where(GuideDay.guide_id.in_(guide_ids)))
        db.execute(sqldelete(GuideMedia).where(GuideMedia.guide_id.in_(guide_ids)))
        db.execute(sqldelete(TravelGuide).where(TravelGuide.id.in_(guide_ids)))
    db.execute(sqldelete(FriendRequest).where(FriendRequest.id.like("fr_demo_%")))
    db.execute(sqldelete(Location).where(Location.id.like("loc_demo_%")))
    if user_ids:
        db.execute(sqldelete(Friendship).where(Friendship.user_id.in_(user_ids)))
        db.execute(sqldelete(User).where(User.id.in_(user_ids)))
    db.commit()
    print(f"[清理] 移除演示账号 {len(user_ids)} 个、记忆 {len(mem_ids)} 段、路线 {len(route_ids)} 条、攻略 {len(guide_ids)} 篇")


def main() -> None:
    refresh = "--refresh" in sys.argv
    clean = "--clean" in sys.argv or refresh
    init_db()
    db = SessionLocal()
    try:
        owner = db.query(User).filter(User.username == OWNER_USERNAME).first()
        if not owner:
            print("先跑 seed_social.py 建主账号")
            return
        if clean:
            clean_demo(db)

        created_users = 0
        created_memories = 0
        for spec in STRANGERS:
            exists = db.query(User).filter(User.username == spec["username"]).first()
            if exists and not refresh:
                print(f"跳过（已存在）：{spec['nickname']}")
                continue
            print(f"→ {spec['nickname']}（{spec['username']}）")
            user = ensure_user(db, spec)
            if not exists:
                created_users += 1
            db.commit()

            for entry in spec["spots"]:
                spot_key, *_ = entry
                city, spot, query = SPOTS[spot_key]
                images = images_for(spot_key, city, spot, query)
                make_memory(db, user, spot_key, entry, images)
                created_memories += 1
            db.commit()

            # 路线
            r_title, r_summary, r_start, r_end, r_tags, stops = spec["route"]
            route = TravelRoute(
                id="rt_demo_" + uuid.uuid4().hex[:8],
                user_id=user.id,
                title=r_title,
                summary=r_summary,
                cover=(user.avatar if user.avatar else None),
                start_date=r_start,
                end_date=r_end,
                tags=json.dumps(r_tags, ensure_ascii=False),
                visibility="public",
            )
            db.add(route)
            db.flush()
            for i, (name, stay, transport, note) in enumerate(stops):
                coords = city_coords.lookup_coords(name) or (0.0, 0.0)
                loc = ensure_location(db, name, name)
                db.add(
                    RoutePoint(
                        route_id=route.id, sort=i, name=name, location_id=loc.id,
                        latitude=coords[0] or loc.latitude, longitude=coords[1] or loc.longitude,
                        arrive_date=r_start, stay_days=stay, transport=transport, note=note,
                    )
                )
            db.flush()

            # 攻略
            g_title, g_sub, g_dest, g_budget, g_season, g_transport, g_stay, g_summary, g_tips, g_days = spec["guide"]
            guide = TravelGuide(
                id="tg_demo_" + uuid.uuid4().hex[:8],
                user_id=user.id,
                title=g_title,
                subtitle=g_sub,
                cover=route.cover,
                destination=g_dest,
                day_count=len(g_days),
                budget=g_budget,
                best_season=g_season,
                transport_info=g_transport,
                stay_info=g_stay,
                summary=g_summary,
                tips=g_tips,
                route_id=route.id,
                visibility="public",
                status="published",
            )
            db.add(guide)
            db.flush()
            for i, (title, content, transport, cost) in enumerate(g_days):
                db.add(
                    GuideDay(
                        id="gd_demo_" + uuid.uuid4().hex[:8], guide_id=guide.id, sort=i,
                        title=title, content=content, transport=transport, cost=cost,
                    )
                )
            # 攻略图集：借用这趟路线上的景点图
            gallery = [url for entry in spec["spots"][:3] for url in _IMAGE_CACHE.get(entry[0], [])][:4]
            for i, url in enumerate(gallery):
                db.add(GuideMedia(guide_id=guide.id, url=url, caption=f"{g_dest} · 随手拍", sort=i))
            db.commit()

        # 两个陌生人主动来加你
        for username in REQUESTERS:
            user = db.query(User).filter(User.username == username).first()
            if not user:
                continue
            exists = db.query(FriendRequest).filter(
                FriendRequest.from_user_id == user.id, FriendRequest.to_user_id == owner.id
            ).first()
            if not exists:
                db.add(
                    FriendRequest(
                        id="fr_demo_" + uuid.uuid4().hex[:8],
                        from_user_id=user.id,
                        to_user_id=owner.id,
                        message="看到你在地图上标的点，想认识一下～",
                        status="pending",
                    )
                )
        db.commit()

        print(
            f"[陌生人数据] 新增账号 {created_users} 个、记忆 {created_memories} 段；"
            f"当前共 {db.query(User).count()} 个账号、{db.query(Memory).count()} 段记忆、"
            f"{db.query(TravelRoute).count()} 条路线、{db.query(TravelGuide).count()} 篇攻略"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
