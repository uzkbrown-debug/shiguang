"""看一眼主账号的记忆都是什么（要按旅游文案重写）"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select id from users where username='demo'")
uid = cur.fetchone()[0]
cur.execute(
    "select m.happened_at, coalesce(l.city,'?'), coalesce(l.name,'?'), m.title, m.media_count, "
    "(select count(*) from memory_media mm where mm.memory_id=m.id) files, coalesce(m.tags,'') "
    "from memories m left join locations l on l.id=m.location_id "
    "where m.user_id=%s order by m.happened_at",
    (uid,),
)
for row in cur.fetchall():
    print(row)
cur.execute("select count(*) from memories where user_id=%s", (uid,))
print("总数", cur.fetchone()[0])
