"""把最后那条（录屏）也补成统一写法"""
import json

import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()

mid = "mem_20261016203526_33f6b4"
title = "屏幕录制：改叠放效果的那天"
body = (
    "先说数：2026-10-05，桌面录屏一段，约 11 秒。\n"
    "那天在调《拾光》记忆详情的叠放效果：原来点开大图会闪一下、还能透出后面的照片。\n"
    "改法是放大层换成纯黑底，详情页恢复成单张大图 + 缩略图条，叠放只留在回忆模式里。\n"
    "留着这段的用处：以后忘了当时怎么改的，翻出来看一眼就行。"
)
tags = ["录屏", "工作", "界面"]

cur.execute(
    "update memories set title=%s, summary=%s, content=%s, happened_at=%s, time_precision='day', tags=%s "
    "where id=%s",
    (
        title,
        "先说数：2026-10-05，桌面录屏一段，约 11 秒。",
        body,
        "2026-10-05T17:05:00",
        json.dumps(tags, ensure_ascii=False),
        mid,
    ),
)
c.commit()
cur.execute("select title, happened_at, content from memories where id=%s", (mid,))
t, when, ct = cur.fetchone()
print(f"{t} | {when}\n{ct}")
