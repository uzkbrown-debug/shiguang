"""端到端测一次：传一张景点照片 → 用 travel 风格分析 → 看 AI 判断的地点和文案

    python _test_analyze.py
"""
import os
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_strangers import commons_images  # noqa: E402

BASE = "http://127.0.0.1:8000"
TMP = Path(__file__).resolve().parent / "data" / "_t"
TMP.mkdir(parents=True, exist_ok=True)


# 主账号：从环境变量读取，仓库里只保留演示默认值
OWNER_USERNAME = os.getenv("DEMO_OWNER_USER", "demo")
OWNER_PASSWORD = os.getenv("DEMO_OWNER_PASS", "demo123456")


def login() -> str:
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=json.dumps({"username": OWNER_USERNAME, "password": OWNER_PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read())["token"]


def post_form(url: str, token: str, files: list[tuple[str, bytes, str]], fields: dict[str, str]):
    boundary = "----shiguangtest"
    body = b""
    for name, data, filename in files:
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        body += b"Content-Type: image/jpeg\r\n\r\n" + data + b"\r\n"
    for key, value in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += f"--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Cookie": f"sg_auth={token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read())


def post_json(url: str, token: str, payload: dict):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json", "Cookie": f"sg_auth={token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=240) as res:
        return json.loads(res.read())


def main() -> None:
    token = login()
    print("登录 ok")

    shots = commons_images("Eiffel Tower Paris", 1)
    if not shots:
        print("图片没下下来，退出")
        return
    photo = shots[0]
    (TMP / "trip_test.jpg").write_bytes(photo)
    print(f"测试照片 {len(photo) // 1024} KB")

    draft = post_form(
        f"{BASE}/api/uploads",
        token,
        [("files", photo, "paris.jpg")],
        {"visibility": "private"},
    )
    mid = draft["memory_id"]
    print("上传完成:", mid)

    result = post_json(f"{BASE}/api/memories/{mid}/analyze?style=travel", token, {"notes": ""})
    d = result["draft"]
    print("\n=== AI 判断 ===")
    print("地点 place:", result.get("place"))
    print("旅行 trip :", result.get("trip"))
    print("标题      :", d.get("title"))
    print("标签      :", d.get("tags"))
    print("文案      :\n", d.get("summary"))
    print("\n步骤:", json.dumps(result.get("steps"), ensure_ascii=False, indent=1))

    # 清理测试数据
    req = urllib.request.Request(
        f"{BASE}/api/memories/{mid}", headers={"Cookie": f"sg_auth={token}"}, method="DELETE"
    )
    urllib.request.urlopen(req, timeout=30).read()
    print("\n已删除测试记忆", mid)


if __name__ == "__main__":
    main()
