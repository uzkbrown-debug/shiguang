"""收尾：删掉自动化测试留下的记忆和临时会话令牌"""
import sys

sys.path.insert(0, '.')
from db import SessionLocal
from models import Memory, MemoryMedia, MemoryPerson, UserSession
from ingest import UPLOAD_DIR

IDS = ["mem_20261018130403_a8171f"]

db = SessionLocal()
for mid in IDS:
    m = db.get(Memory, mid)
    if not m:
        print("没有：", mid)
        continue
    for media in db.query(MemoryMedia).filter(MemoryMedia.memory_id == mid).all():
        if media.url.startswith("/media/uploads/"):
            (UPLOAD_DIR / media.url.split("/")[-1]).unlink(missing_ok=True)
        db.delete(media)
    db.query(MemoryPerson).filter(MemoryPerson.memory_id == mid).delete(synchronize_session=False)
    db.delete(m)
    print("删掉测试记忆：", mid, m.title)

row = db.get(UserSession, "dsh-verify-token-0001")
if row:
    db.delete(row)
    print("删掉临时会话令牌")

db.commit()
print("剩余记忆数：", db.query(Memory).count())
db.close()
