"""给路线也加一行「先说数」，和攻略/记忆保持同一写法

    python polish_route_intros.py
"""
from db import SessionLocal, init_db
from models import RoutePoint, TravelRoute, User


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        done = 0
        for route in db.query(TravelRoute).all():
            raw = (route.summary or "").strip()
            body = "\n".join(l for l in raw.split("\n") if not l.strip().startswith("先说数")).strip()

            points = db.query(RoutePoint).filter(RoutePoint.route_id == route.id).all()
            days = sum(max(1, p.stay_days or 1) for p in points) or len(points)
            owner = db.get(User, route.user_id)
            dates = ""
            if route.start_date and route.end_date:
                dates = f"{route.start_date}—{route.end_date}，"
            elif route.start_date:
                dates = f"{route.start_date} 起，"

            head = f"{dates}{len(points)} 个停留点"
            if owner:
                head += f"，{owner.nickname} 走的"
            route.summary = f"先说数：{head}。\n{body}" if body else f"先说数：{head}。"
            done += 1
        db.commit()
        print(f"[完成] {done} 条路线补上「先说数」")
    finally:
        db.close()


if __name__ == "__main__":
    main()
