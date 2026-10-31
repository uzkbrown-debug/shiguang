"""图集去重：同一篇攻略里同一张图只留一条"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select guide_id, url, count(*) n, min(id) keep_id from guide_media group by guide_id, url having n > 1")
dups = cur.fetchall()
print("重复条目:", len(dups))
for guide_id, url, n, keep_id in dups:
    cur.execute("delete from guide_media where guide_id=%s and url=%s and id<>%s", (guide_id, url, keep_id))
c.commit()
cur.execute("select g.title, count(*) from guide_media m join travel_guides g on g.id=m.guide_id group by g.id")
for row in cur.fetchall():
    print(" ", row[0], row[1], "张")
