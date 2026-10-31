"""列出所有演示账号的记忆标题与现在的一句话正文"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute(
    "select u.nickname, m.title, m.summary from memories m join users u on u.id=m.user_id "
    "where u.username <> 'demo' order by u.nickname, m.happened_at"
)
for nick, title, summary in cur.fetchall():
    print(f"{nick}\t{title}\t{(summary or '').replace(chr(10),' ')}")
