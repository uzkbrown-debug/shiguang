"""看那条唯一没写的记忆：照片在哪、有没有已有字段"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute(
    "select id, title, summary, content, happened_at, location_id, cost_json, tips, transport_info "
    "from memories where id='mem_20261016203526_33f6b4'"
)
row = cur.fetchone()
print("字段:", row)
cur.execute("select url, caption from memory_media where memory_id='mem_20261016203526_33f6b4' order by sort")
for url, caption in cur.fetchall():
    print("照片:", url, "|", caption)
