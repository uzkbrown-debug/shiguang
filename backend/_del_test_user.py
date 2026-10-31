"""删掉测试账号"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute("select id from users where username='tester_qa'")
row = cur.fetchone()
if row:
    uid = row[0]
    cur.execute("delete from user_sessions where user_id=%s", (uid,))
    cur.execute("delete from friendships where user_id=%s or friend_user_id=%s", (uid, uid))
    cur.execute("delete from friend_requests where from_user_id=%s or to_user_id=%s", (uid, uid))
    cur.execute("delete from users where id=%s", (uid,))
    c.commit()
    print("已删除测试账号")
else:
    print("没有测试账号")
cur.execute("select count(*) from users")
print("账号总数:", cur.fetchone()[0])
