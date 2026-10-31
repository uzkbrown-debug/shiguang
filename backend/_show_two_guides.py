"""抽两篇看看现在跟「沪苏杭」那篇是不是一个写法"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
for title_like in ("%泰山%", "%青藏%"):
    cur.execute(
        "select g.title, g.subtitle, g.summary, g.transport_info, g.stay_info, g.tips, g.budget "
        "from travel_guides g where g.title like %s limit 1",
        (title_like,),
    )
    row = cur.fetchone()
    if not row:
        continue
    title, sub, summary, transport, stay, tips, budget = row
    print("=" * 60)
    print(f"《{title}》 — {sub}")
    print(f"预算：{budget}\n")
    print("【前言】")
    print(summary)
    print("\n【交通】")
    print(transport)
    print("\n【住宿】")
    print(stay)
    print("\n【提醒】")
    print(tips)
    cur.execute(
        "select d.title, d.transport, d.cost, d.content from guide_days d join travel_guides g on g.id=d.guide_id "
        "where g.title like %s order by d.sort",
        (title_like,),
    )
    print("\n【分天】")
    for dtitle, dtransport, dcost, content in cur.fetchall():
        print(f"- {dtitle}（{dtransport} · {dcost}）")
        print(f"  {content}")
    print()
