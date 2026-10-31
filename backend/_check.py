import json
import os
import urllib.request

BASE = "http://127.0.0.1:8000"
out_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "_shots", "api_check.json")
)


def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=20) as response:
        return json.load(response)


result = {}
result["health"] = get("/api/health")
memories = get("/api/memories?limit=3")
result["memories_3"] = memories

if memories:
    mid = memories[0]["id"]
    detail = get(f"/api/memories/{mid}")
    result["detail"] = {
        "id": mid,
        "title": detail["title"],
        "happened_at": detail["happened_at"],
        "person_ids": detail["person_ids"],
        "tags": detail["tags"],
        "location": detail["location"],
        "media_in_detail": len(detail["media"]),
    }
    media = get(f"/api/memories/{mid}/media")
    result["media_page"] = {
        "memory_id": media["memory_id"],
        "title": media["title"],
        "photo_count": len(media["photos"]),
        "first_photo": media["photos"][0] if media["photos"] else None,
    }

result["years"] = get("/api/timeline/years")
result["stories"] = get("/api/stories")

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("written:", out_path)
