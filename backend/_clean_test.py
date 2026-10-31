"""清掉自测留下的记忆与地点"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select id, title from memories where title like '%铁塔%' or title like '%巴黎%'")
rows = cur.fetchall()
print("测试残留:", rows)
for mid, _title in rows:
    cur.execute("delete from memory_media where memory_id=%s", (mid,))
    cur.execute("delete from memory_persons where memory_id=%s", (mid,))
    cur.execute("delete from memories where id=%s", (mid,))
c.commit()
cur.execute("select count(*) from memories")
print("记忆总数", cur.fetchone()[0])
cur.execute("select id, name from locations where name like '%铁塔%' or name like '%巴黎%'")
print("测试地点:", cur.fetchall())
