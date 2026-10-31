"""确认攻略的预算算式与取舍提醒写进去了"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select g.title, g.budget, g.tips from travel_guides g order by g.created_at limit 14")
rows = cur.fetchall()
for title, budget, tips in rows:
    last = [t for t in (tips or "").split("\n") if t.strip()][-1:] or [""]
    print(f"{title}\n   预算: {budget}\n   末条: {last[0]}")
has_calc = sum(1 for _t, b, _x in rows if b and "+" in b)
print(f"\n共 {len(rows)} 篇，其中带算式预算 {has_calc} 篇")
