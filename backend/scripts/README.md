# backend/scripts

演示前、改完数据后跑一遍的检查工具。都是**只读**的，不会写库。

## audit_locations.py

地点表体检：找出重复地点（规范化名字 + 城市后同名的行）、名字和城市不一致的可疑行、
没有坐标的行、以及没有任何记忆引用的孤立地点。

```bat
cd backend
python scripts/audit_locations.py
```

输出人类可读的报告，并写一份 `audit_locations.json`（同目录）方便比对。

> 重复地点的典型样子：`loc_xiamen`（0 条记忆）和 `loc_demo_c16289732b`（3 条记忆）都叫“厦门”。
> 合并前先看报告确认哪条是主记录 —— 不建议直接删行，写一个迁移脚本按 id 回填引用更安全。

## selftest_assistant.py

小拾 AI 的关键行为自检，任何一项不符合就退出码 1：

1. 地点识别（厦门 / 鼓浪屿 / 拉萨）
2. 「我去过没 / 谁去过」：厦门有记录、拉萨没有但能列出别人、鼓浪屿按地点计数
3. 「我去过哪些地方」的排序
4. 证据记忆 → 攻略 id 的映射是否一致

```bat
cd backend
python scripts/selftest_assistant.py
```

演示前跑一次，比手动点五个问题快。

## reset_demo_passwords.py

把三个演示账号（`2206481523` / `xiaomei` / `tina_food`）的口令重置成 `shiguang2026`。
只改 `password_hash` / `salt`，不动记忆、攻略、好友关系。账号清单与互测步骤见项目根目录 `测试账号.md`。

```bat
cd backend
python scripts/reset_demo_passwords.py
```
