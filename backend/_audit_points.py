"""检查地图上所有点的文案是否够用：太短 / 没有具体数字的都列出来"""
import pymysql

c = pymysql.connect(host="127.0.0.1", port=3306, user="root", password="1234", database="shiguang", charset="utf8mb4")
cur = c.cursor()
cur.execute(
    "select m.id, u.nickname, m.title, coalesce(m.content,''), m.summary from memories m "
    "join users u on u.id=m.user_id order by length(coalesce(m.content,''))"
)
rows = cur.fetchall()
thin, no_num, empty = [], [], []
for mid, nick, title, content, summary in rows:
    text = content or summary or ""
    if not text.strip():
        empty.append((mid, nick, title))
    elif len(text) < 40:
        thin.append((mid, nick, title, text))
    elif not any(ch.isdigit() for ch in text):
        no_num.append((mid, nick, title, text))

print(f"共 {len(rows)} 个点：空 {len(empty)} / 太短 {len(thin)} / 没数字 {len(no_num)}\n")
print("— 空的 —")
for mid, nick, title in empty:
    print(f"  {mid} {nick} {title}")
print("\n— 太短（<40 字）—")
for mid, nick, title, text in thin:
    print(f"  {nick}｜{title}｜{text}")
print("\n— 没有一个数字 —")
for mid, nick, title, text in no_num[:12]:
    print(f"  {nick}｜{title}｜{text[:60]}")
