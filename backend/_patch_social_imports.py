"""补 routes_social.py 的 import 和 hmac 比较"""
import pathlib

p = pathlib.Path("routes_social.py")
s = p.read_text(encoding="utf-8")

if "import hmac" not in s:
    s = s.replace("import uuid", "import hmac\nimport uuid", 1)

s = s.replace(
    'hmac_compare(user.answer_hash, hash_password(body.answer.strip(), user.answer_salt or ""))',
    'hmac.compare_digest(user.answer_hash, hash_password(body.answer.strip(), user.answer_salt or ""))',
)

if "UserSession," not in s:
    s = s.replace("    TravelRoute,\n    User,\n)", "    TravelRoute,\n    User,\n    UserSession,\n)")

p.write_text(s, encoding="utf-8")
print("import hmac:", "import hmac" in s)
print("compare_digest:", "compare_digest" in s)
print("UserSession 已在 models 导入:", "UserSession," in s)
