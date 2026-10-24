"""轻量迁移：create_all 只建新表，不会给老表加列，这里补上"""
from sqlalchemy import inspect, text

from db import engine

# 表名 -> [(列名, DDL 片段)]
_ADD_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "memories": [
        ("visibility", "VARCHAR(16) NOT NULL DEFAULT 'friends'"),
        ("cost_json", "TEXT NULL"),
        ("transport_info", "TEXT NULL"),
        ("stay_info", "TEXT NULL"),
        ("tips", "TEXT NULL"),
    ],
    "guide_days": [("image_url", "VARCHAR(512) NULL")],
    "users": [
        ("security_question", "VARCHAR(64) NULL"),
        ("answer_hash", "VARCHAR(128) NULL"),
        ("answer_salt", "VARCHAR(64) NULL"),
    ],
    "friendships": [("remark", "VARCHAR(64) NULL")],
    "memory_media": [("captured_at", "VARCHAR(32) NULL")],
}


def _columns(conn, table: str) -> set[str]:
    return {row[0] for row in conn.exec_driver_sql(f"SHOW COLUMNS FROM `{table}`")}


def run_migrations() -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, columns in _ADD_COLUMNS.items():
            if table not in tables:
                continue
            existing = _columns(conn, table)
            for name, ddl in columns:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE `{table}` ADD COLUMN `{name}` {ddl}"))
                    print(f"[migrate] {table}.{name} 已补上")
