"""给视频素材补封面：memory_media.poster + 用 ffmpeg 抽首帧

前端 `<video preload="metadata">` 在很多 mp4 上画不出首帧（moov 在文件尾），
列表里就只剩黑框。这里给每条视频素材生成一张 jpg 存在 media/posters/，
接口返回 poster，缩略图直接当图片用。

跑一次即可；重复跑只会补还没有封面的。
"""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import inspect, select, text

import ingest
from db import SessionLocal, engine
from models import MemoryMedia


def main() -> None:
    with engine.begin() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("memory_media")}
        if "poster" not in cols:
            conn.execute(text("ALTER TABLE memory_media ADD COLUMN poster VARCHAR(512) NULL"))
            print("+ memory_media.poster")

    ffmpeg = ingest.find_ffmpeg()
    print("ffmpeg:", ffmpeg or "没找到（视频封面会跳过）")

    db = SessionLocal()
    made = skipped = failed = 0
    try:
        rows = db.scalars(select(MemoryMedia)).all()
        for row in rows:
            url = (row.url or "").lower()
            if not url.endswith(tuple(ingest.VIDEO_EXT)):
                continue
            if getattr(row, "poster", None):
                skipped += 1
                continue
            path = ingest.UPLOAD_DIR / row.url.split("/")[-1]
            if not path.is_file():
                failed += 1
                continue
            poster = ingest.make_video_poster(path)
            if poster:
                row.poster = poster
                made += 1
                print(f"  {row.url} → {poster}")
            else:
                failed += 1
                print(f"  {row.url} 抽帧失败")
        db.commit()
    finally:
        db.close()
    print(f"\n补齐 {made} 条，已有 {skipped} 条，失败 {failed} 条")
    posters = Path(ingest.POSTER_DIR)
    if posters.is_dir():
        print("posters 目录:", len(list(posters.glob("*.jpg"))), "张")


if __name__ == "__main__":
    sys.exit(main())
