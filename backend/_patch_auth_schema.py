"""给 User 加密保字段、给 Friendship 加备注（幂等）"""
import pathlib

m = pathlib.Path("models.py")
s = m.read_text(encoding="utf-8")

if "security_question" not in s:
    s = s.replace(
        "    home_city: Mapped[str | None] = mapped_column(String(64))\n    created_at",
        "    home_city: Mapped[str | None] = mapped_column(String(64))\n"
        "    # 密保问题（找回密码用）\n"
        "    security_question: Mapped[str | None] = mapped_column(String(64))\n"
        "    answer_hash: Mapped[str | None] = mapped_column(String(128))\n"
        "    answer_salt: Mapped[str | None] = mapped_column(String(64))\n"
        "    created_at",
    )

if "remark: Mapped" not in s:
    s = s.replace(
        '    friend_user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))\n    created_at',
        '    friend_user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))\n'
        "    remark: Mapped[str | None] = mapped_column(String(64))\n"
        "    created_at",
    )

m.write_text(s, encoding="utf-8")
print("models:", "security_question" in s, "remark: Mapped" in s)

p = pathlib.Path("migrate.py")
t = p.read_text(encoding="utf-8")
if "security_question" not in t:
    t = t.replace(
        '    "guide_days": [("image_url", "VARCHAR(512) NULL")],',
        '    "guide_days": [("image_url", "VARCHAR(512) NULL")],\n'
        '    "users": [\n'
        '        ("security_question", "VARCHAR(64) NULL"),\n'
        '        ("answer_hash", "VARCHAR(128) NULL"),\n'
        '        ("answer_salt", "VARCHAR(64) NULL"),\n'
        "    ],\n"
        '    "friendships": [("remark", "VARCHAR(64) NULL")],',
    )
    p.write_text(t, encoding="utf-8")
print("migrate:", "security_question" in t)
