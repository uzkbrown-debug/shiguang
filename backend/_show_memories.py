"""看几条记忆现在长什么样"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select count(*) from memories where content like '先说数：%'")
print("带新开头:", cur.fetchone()[0], "/ 69\n")
cur.execute("select title, content from memories where id=%s", ("mem_20261016202036_32f686",))
r = cur.fetchone()
print("=== 你打开的那条 ===")
print(r[0])
print(r[1])
print("\n=== 抽查两条别人的 ===")
cur.execute(
    "select m.title, m.content from memories m join users u on u.id=m.user_id "
    "where u.username in ('anna_world','xiaoyu_sea') limit 2"
)
for title, content in cur.fetchall():
    print(f"--- {title}\n{content}\n")
