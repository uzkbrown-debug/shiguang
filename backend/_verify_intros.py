"""确认开头没重复，并抽查三条"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select count(*) from memories where content like '%%我的走法%%我的走法%%'")
print("重复开头的记忆:", cur.fetchone()[0])
cur.execute("select count(*) from memories where content like '先说数：%%'")
print("带新开头的记忆:", cur.fetchone()[0])

for mid in ("mem_20261016202036_32f686",):
    cur.execute("select title, content from memories where id=%s", (mid,))
    t, ct = cur.fetchone()
    print(f"\n=== {t} ===\n{ct}")

cur.execute(
    "select m.title, m.content from memories m join users u on u.id=m.user_id where u.username='anna_world' limit 1"
)
t, ct = cur.fetchone()
print(f"\n=== {t}（Anna）===\n{ct}")
