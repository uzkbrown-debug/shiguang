"""抽查统一后的记忆写法"""
import json

import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
for kw in ("拙政园", "张家界", "西湖", "布达拉宫"):
    cur.execute(
        "select m.title, m.content, m.cost_json, m.tips, u.nickname from memories m "
        "join users u on u.id=m.user_id where m.title like %s limit 1",
        (f"%{kw}%",),
    )
    row = cur.fetchone()
    if not row:
        continue
    title, content, cost_json, tips, nick = row
    items = json.loads(cost_json or "[]")
    detail = " + ".join(f"{i['label']} {int(i['amount'])}" for i in items if i.get("amount") is not None)
    print(f"【{nick}｜{title}】\n{content}")
    if detail:
        print(f"消费：{detail}")
    if tips:
        print(f"提醒：{tips.splitlines()[0]}")
    print()

cur.execute("select count(*) from memories where content like '先说数：%%'")
print("带先说数的:", cur.fetchone()[0])
cur.execute("select count(*) from memories where content like '%%我的走法%%'")
print("还有我的走法的:", cur.fetchone()[0])
