"""给 users 补 banner / about：个人主页的横幅和正文也要能自己写

- banner：主页顶部那张大图（可以选一张自己的记忆封面，也可以上传）
- about ：主页正文，极简 markdown（## 小标题 / - 列表 / > 引用 / **加粗**）

以前这一段是写死在前端的「关于这个项目」，所以看起来像每个人都在自我介绍项目。
这里把那段文字落进每个用户自己的 about（只填还空着的），之后想怎么改都行。
跑一次即可；重复跑会跳过。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, select, text

from db import SessionLocal, engine
from models import User

DEFAULT_ABOUT = """## 你好，这里是拾光
一个把照片写成游记的地方。你把一批照片丢进来，它认出这是哪座城市、哪一天、和谁在一起，然后写成一段你自己回看时能读下去的文字。

## 关于这个项目
拾光使用 Next.js 16 + React 19 + Tailwind CSS 4 构建，后端是 FastAPI + MySQL，看图说话交给 DeepSeek 多模态模型。界面采用玻璃拟态设计。同一批照片，会同时长成攻略、路线和地图三种样子。

## 技术栈
- **主力**：Next.js, React, TypeScript, Tailwind CSS
- **后端**：FastAPI, SQLAlchemy, MySQL
- **AI**：DeepSeek 多模态、edge-tts 语音

## 这里有什么
- 上传一批照片，AI 认地点、认时间、认同行的人
- 每段记忆默认「仅自己可见」，给谁看由你决定
- 同一次出行可以从攻略、路线、地图三个角度回看
- 说一句话就能问它：「我去过哪些地方」

> 记忆不会自己排队，得有人给它排个序。"""


def main() -> None:
    with engine.begin() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("users")}
        if "banner" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN banner VARCHAR(512) NULL"))
            print("+ users.banner")
        if "about" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN about MEDIUMTEXT NULL"))
            print("+ users.about")

    db = SessionLocal()
    filled = 0
    try:
        for u in db.scalars(select(User)).all():
            if not (u.about or "").strip():
                u.about = DEFAULT_ABOUT
                filled += 1
        db.commit()
    finally:
        db.close()
    print(f"填入默认正文 {filled} 个账号（已经有内容的没动）")


if __name__ == "__main__":
    sys.exit(main())
