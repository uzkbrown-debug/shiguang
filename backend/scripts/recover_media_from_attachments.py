"""从聊天附件里把被删的图片找回来：附件文件名的 sha256 前缀正好等于上传后的存储名。

只做匹配和预演，不写任何文件（--copy 才复制到 uploads）。
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ATTACH = Path(r"C:\Users\ASUS\AppData\Roaming\dsh-desktop\harness\attachments\v1\objects")
UPLOADS = ROOT / "media" / "uploads"
RECOVERED = ROOT / "legacy_recovered"


def sha16(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def main(argv: list[str]) -> int:
    copy = "--copy" in argv
    media = json.loads((RECOVERED / "memory_media.json").read_text(encoding="utf-8"))
    wanted = {row["url"].split("/")[-1]: row for row in media if (row.get("url") or "").startswith("/media/uploads/")}
    print(f"binlog 里被删的媒体记录 {len(wanted)} 个文件")

    found: dict[str, Path] = {}
    if ATTACH.exists():
        for p in ATTACH.rglob("*"):
            if not p.is_file() or p.stat().st_size > 40 * 1024 * 1024:
                continue
            try:
                key = sha16(p)
            except OSError:
                continue
            for name in wanted:
                if name.startswith(key):
                    found[name] = p

    print(f"在聊天附件里匹配到 {len(found)} 个：")
    for name, src in sorted(found.items()):
        print(f"  {name}  <-  {src.name}")

    missing = sorted(set(wanted) - set(found))
    print(f"仍缺 {len(missing)} 个（这些只能靠你自己的原图）：")
    for name in missing[:10]:
        print("  ", name)

    if copy and found:
        UPLOADS.mkdir(parents=True, exist_ok=True)
        for name, src in found.items():
            dst = UPLOADS / name
            shutil.copy2(src, dst)
        print(f"已复制 {len(found)} 个文件到 {UPLOADS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
