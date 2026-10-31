"""把误删的那条演示记忆补回来（Anna · 埃菲尔铁塔整点闪灯）"""
import json
import uuid

import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()

cur.execute("select id from users where username='anna_world'")
row = cur.fetchone()
if not row:
    print("找不到 Anna 账号")
    raise SystemExit
uid = row[0]

cur.execute("select id from locations where name='埃菲尔铁塔'")
loc = cur.fetchone()
loc_id = loc[0] if loc else None

# 封面借她自己攻略图集里的巴黎照片
cur.execute(
    "select gm.url from guide_media gm join travel_guides g on g.id=gm.guide_id "
    "where g.user_id=%s and gm.caption like %s limit 1",
    (uid, "巴黎%"),
)
hit = cur.fetchone()
cover = hit[0] if hit else None
if not cover:
    cur.execute(
        "select gm.url from guide_media gm join travel_guides g on g.id=gm.guide_id where g.user_id=%s limit 1",
        (uid,),
    )
    hit2 = cur.fetchone()
    cover = hit2[0] if hit2 else None

mid = "mem_demo_" + uuid.uuid4().hex[:10]
cur.execute(
    "insert into memories (id,title,summary,content,happened_at,time_precision,location_id,tags,emotion,"
    "importance,source_type,cover,media_count,ai_status,confidence,ai_generated,user_id,visibility,created_at,updated_at) "
    "values (%s,%s,%s,%s,%s,'day',%s,%s,'开心',3,'photo',%s,1,'confirmed',0.92,0,%s,'public',now(),now())",
    (
        mid,
        "埃菲尔铁塔整点闪灯",
        "第一晚看到的时候真的哇出声。",
        "第一晚看到的时候真的哇出声。",
        "2025-06-20T21:00:00",
        loc_id,
        json.dumps(["欧洲", "巴黎", "夜景"], ensure_ascii=False),
        cover,
        uid,
    ),
)
if cover:
    cur.execute(
        "insert into memory_media (memory_id,url,caption,sort) values (%s,%s,%s,0)",
        (mid, cover, "埃菲尔铁塔 · 1"),
    )
c.commit()
cur.execute("select count(*) from memories")
print("已补回", mid, "| 记忆总数", cur.fetchone()[0])
