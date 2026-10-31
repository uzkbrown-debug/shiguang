"""自测用：打印最近几条记忆、媒体数与可见范围"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute(
    "select m.id, m.title, m.user_id, m.visibility, m.media_count, "
    "(select count(*) from memory_media mm where mm.memory_id = m.id) as files "
    "from memories m order by m.created_at desc limit 6"
)
for row in cur.fetchall():
    print(row)
cur.execute("select count(*) from memories")
print("记忆总数", cur.fetchone()[0])
cur.execute("select count(*) from memory_media")
print("媒体总数", cur.fetchone()[0])
cur.execute("select id, username, nickname from users")
print("账号", cur.fetchall())
cur.execute("select id, title, user_id, visibility from travel_routes")
print("路线", cur.fetchall())
cur.execute("select id, title, user_id, visibility from travel_guides")
print("攻略", cur.fetchall())
cur.execute("select count(*) from friendships")
print("好友关系条数", cur.fetchone()[0])
