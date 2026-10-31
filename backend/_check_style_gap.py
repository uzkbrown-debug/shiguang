"""量一下每篇攻略离「沪苏杭」那个模板还差什么"""
import re

import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute(
    "select g.id, g.title, g.summary, g.transport_info, g.stay_info, g.tips, g.budget from travel_guides g"
)
guides = cur.fetchall()

NUM = re.compile(r"\d")


def lines(text):
    return [t.strip() for t in (text or "").split("\n") if t.strip()]


print(f"{'攻略':<22} {'前言行':<5} {'有走法':<6} {'交通数字行':<10} {'住宿数字':<8} {'提醒条':<6} {'预算算式'}")
for gid, title, summary, transport, stay, tips, budget in guides:
    s, t, st, tp = lines(summary), lines(transport), lines(stay), lines(tips)
    walk = any(("我的走法" in x) or ("走法" in x) or ("经验" in x) for x in s)
    t_num = sum(1 for x in t if NUM.search(x))
    stay_num = any(NUM.search(x) for x in st)
    calc = bool(budget and "+" in budget)
    flag = "" if (len(s) >= 3 and walk and t_num >= len(t) - 1 and stay_num and len(tp) >= 4 and calc) else "  ← 要补"
    print(f"{title[:20]:<22} {len(s):<5} {str(walk):<6} {t_num}/{len(t):<8} {str(stay_num):<8} {len(tp):<6} {str(calc)}{flag}")
