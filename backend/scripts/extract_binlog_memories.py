"""从 MySQL binlog 里把被删掉的 memories / memory_media 行捞出来。

只读 binlog 文本（mysqlbinlog -v 的输出），不碰数据库、不改现有数据。

用法：
    mysqlbinlog --base64-output=DECODE-ROWS -v <binlog> > binlog.txt
    python scripts/extract_binlog_memories.py binlog.txt out_dir
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from db import engine  # noqa: E402

TARGET_TABLES = {
    "users",
    "memories",
    "memory_media",
    "memory_visits",
    "friendships",
    "travel_guides",
    "guide_days",
    "guide_media",
    "travel_routes",
    "route_points",
}

ROW_RE = re.compile(r"^###\s+@(\d+)=(.*)$")
HDR_RE = re.compile(r"^###\s+(INSERT INTO|UPDATE|DELETE FROM)\s+`([^`]+)`\.`([^`]+)`")


def columns_of(table: str) -> list[str]:
    with engine.connect() as c:
        rows = c.execute(
            text(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t "
                "ORDER BY ORDINAL_POSITION"
            ),
            {"t": table},
        ).fetchall()
    return [r[0] for r in rows]


def parse_value(raw: str):
    """###   @N=... 右侧的原文 → Python 值"""
    body = raw.split("/*", 1)[0].strip()
    if body == "NULL":
        return None
    if len(body) >= 2 and body.startswith("'") and body.endswith("'"):
        return body[1:-1].replace("''", "'").replace("\\'", "'")
    try:
        return int(body)
    except ValueError:
        pass
    try:
        return float(body)
    except ValueError:
        return body


def extract(path: Path) -> dict[str, list[dict]]:
    cols = {t: columns_of(t) for t in TARGET_TABLES}
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()

    result: dict[str, list[dict]] = {t: [] for t in TARGET_TABLES}
    i = 0
    while i < len(lines):
        m = HDR_RE.match(lines[i])
        if not m or m.group(1) != "DELETE FROM" or m.group(3) not in TARGET_TABLES:
            i += 1
            continue

        table = m.group(3)
        names = cols[table]
        # 一个 DELETE 事件里可能连续多行（WHERE 后紧跟 @1..@N 组），按列数分组
        j = i + 1
        pending: dict[int, object] = {}
        while j < len(lines) and lines[j].startswith("###"):
            rm = ROW_RE.match(lines[j])
            if rm:
                idx = int(rm.group(1))
                pending[idx] = parse_value(rm.group(2))
                if idx == len(names):
                    row = {names[k - 1]: pending.get(k) for k in range(1, len(names) + 1)}
                    result[table].append(row)
                    pending = {}
            j += 1
        i = j

    return result


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("需要 binlog 文本路径和输出目录")
        return 2
    src = Path(argv[0])
    out_dir = Path(argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)

    data = extract(src)
    for table, rows in data.items():
        if not rows:
            continue
        # 同一个 id 可能出现多次（历史删除），按主键去重保留最后一条
        seen: dict[str, dict] = {}
        for row in rows:
            key = str(
                row.get("id")
                or row.get("user_id")
                or row.get("memory_id")
                or row.get("guide_id")
                or row.get("route_id")
                or ""
            )
            if table in ("friendships", "memory_visits"):
                key = f"{key}|{row.get('friend_user_id') or row.get('memory_id')}"
            seen[key] = row
        unique = list(seen.values())
        target = out_dir / f"{table}.json"
        target.write_text(json.dumps(unique, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{table:16s} 抓到 {len(rows)} 行 → 去重 {len(unique)} 行 → {target}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
