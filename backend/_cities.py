"""看一眼全部记忆涉及哪些城市（要按城市写「我的走法」那一句）"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute(
    "select coalesce(l.city,'?') city, count(*) n from memories m left join locations l on l.id=m.location_id "
    "group by city order by n desc"
)
rows = cur.fetchall()
print("记忆涉及的城市：")
for city, n in rows:
    print(f"  {city} × {n}")
cur.execute("select count(*) from memories")
print("记忆总数:", cur.fetchone()[0])
