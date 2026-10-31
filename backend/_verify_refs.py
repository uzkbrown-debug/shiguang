"""跑一遍真实的地图接口逻辑，检查每个节点有没有「出处」"""
import sys

sys.path.insert(0, '.')
from db import SessionLocal
from models import User
import routes_travel

db = SessionLocal()
viewer = db.get(User, "usr_c28e462a0e")  # 演示里的「我」

lines = []
for label, scope, user in (
    ("登录后 · world（地图页默认）", "world", viewer),
    ("未登录（游客）", "world", None),
):
    data = routes_travel.explore(scope=scope, year=None, db=db, viewer=user)
    pts = data["points"]
    no_ref = [p for p in pts if not p["route_refs"] and not p["guide_refs"]]
    lines.append("===== %s =====" % label)
    lines.append("节点总数 %d ｜ 有攻略出处 %d ｜ 有路线出处 %d ｜ 完全没有出处 %d" % (
        len(pts),
        sum(1 for p in pts if p["guide_refs"]),
        sum(1 for p in pts if p["route_refs"]),
        len(no_ref),
    ))
    for p in pts:
        g = " / ".join("%s 第%s天" % (r["title"], r["day"]) for r in p["guide_refs"]) or "—"
        r = " / ".join("%s 第%s/%s站" % (x["title"], x["stop"], x["total"]) for x in p["route_refs"]) or "—"
        flag = "  <<< 没有出处" if not p["guide_refs"] and not p["route_refs"] else ""
        lines.append("%-14s %-26s 攻略[%s] 路线[%s]%s" % (
            p["location_name"] or "", p["title"][:24], g, r, flag))
    lines.append("")

open("../_verify_refs.txt", "w", encoding="utf-8").write("\n".join(lines))
print(lines[0])
print(lines[1])
print(lines[2])
db.close()
