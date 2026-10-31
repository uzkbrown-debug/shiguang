"""把几个要检查的地图点的 id 打出来"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
for kw in ("拙政园", "清晨六点", "张家界"):
    cur.execute("select id, title from memories where title like %s limit 1", (f"%{kw}%",))
    row = cur.fetchone()
    print(row[0] if row else f"（没有 {kw}）", row[1] if row else "")
