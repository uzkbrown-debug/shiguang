"""看抽取出来的消费明细对不对"""
import json

import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select count(*) from memories where cost_json is not null and cost_json <> '[]'")
print("有消费明细的记忆:", cur.fetchone()[0], "/ 69\n")
cur.execute("select title, cost_json from memories where cost_json is not null and cost_json <> '[]' limit 6")
for title, raw in cur.fetchall():
    items = json.loads(raw)
    total = sum(i.get("amount") or 0 for i in items)
    detail = " + ".join(f"{i['label']} {int(i['amount'])}" for i in items)
    print(f"{title}\n    {detail}  → 合计 ¥{int(total)}")
