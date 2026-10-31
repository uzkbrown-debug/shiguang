"""端到端测：注册 → 登录 → 忘密码（密保）→ 重置 → 用新密码登录 → 加好友（备注）"""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
USER = "tester_qa"
PWD = "abc123456"
NEW = "newpass789"


def call(path, payload, method="POST", token=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", **({"Cookie": f"sg_auth={token}"} if token else {})},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


print("1) 注册（带密保）")
code, data = call(
    "/api/auth/register",
    {
        "username": USER,
        "password": PWD,
        "nickname": "测试小号",
        "home_city": "苏州",
        "security_question": "我最喜欢的城市是？",
        "security_answer": "苏州",
    },
)
print("   ->", code, data.get("user", {}).get("nickname", data))
token = data.get("token")

print("2) 重复注册应报错")
print("   ->", call("/api/auth/register", {"username": USER, "password": PWD})[0])

print("3) 忘记密码：查密保问题")
code, data = call("/api/auth/forgot", {"username": USER})
print("   ->", code, data)

print("4) 密保答错应被拒")
print("   ->", call("/api/auth/reset", {"username": USER, "answer": "北京", "new_password": NEW})[0])

print("5) 密保答对 → 重设密码")
print("   ->", call("/api/auth/reset", {"username": USER, "answer": "苏州", "new_password": NEW}))

print("6) 旧密码应登录失败")
print("   ->", call("/api/auth/login", {"username": USER, "password": PWD})[0])

print("7) 新密码登录")
code, data = call("/api/auth/login", {"username": USER, "password": NEW})
print("   ->", code, data.get("user", {}).get("nickname"))
token = data.get("token")

print("8) 登出")
print("   ->", call("/api/auth/logout", None, token=token))

print("9) 清掉测试账号（用主账号删好友关系再删库是麻烦事，这里只提示）")
print("   测试账号:", USER, "（密码现在是", NEW, "）")
