"""看几个地图点现在的文案（要和攻略正文一个口气）"""
import json

import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select count(*) from memories where content like '先说数%%'")
print("还剩假开头的:", cur.fetchone()[0])
cur.execute("select count(*) from memories where content is null or content = ''")
print("正文空掉的:", cur.fetchone()[0])

cur.execute(
    "select m.title, m.content, m.cost_json, u.nickname from memories m join users u on u.id=m.user_id "
    "where m.title like %s or m.title like %s or m.title like %s limit 3",
    ("%拙政园%", "%西湖%", "%张家界%"),
)
for title, content, cost_json, nick in cur.fetchall():
    items = json.loads(cost_json or "[]")
    detail = " + ".join(f"{i['label']} {int(i['amount'])}" for i in items if i.get("amount") is not None)
    print(f"\n【{nick}】{title}\n{content}\n消费：{detail or '（无）'}")
