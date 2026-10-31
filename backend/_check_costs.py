"""检查几条记忆的消费字段到底写进去没有"""
import json

import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute(
    "select id, title, cost_json, tips is not null from memories "
    "where user_id=(select id from users where username='demo') order by happened_at desc limit 8"
)
for mid, title, cost_json, has_tips in cur.fetchall():
    costs = json.loads(cost_json or "[]")
    print(f"{mid} | {title} | 消费 {len(costs)} 项 | 提醒 {has_tips}")
