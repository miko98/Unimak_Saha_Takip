import json
import urllib.error
import urllib.parse
import urllib.request


BASE_URL = "http://127.0.0.1:8000"
PASSWORD = "1234"


def login(username: str):
    data = urllib.parse.urlencode({"kullanici_adi": username, "sifre": PASSWORD}).encode()
    req = urllib.request.Request(f"{BASE_URL}/giris/", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode())
        token = body.get("access_token")
        if not token:
            raise RuntimeError(f"Login failed for {username}: {body}")
        return token


def get(path: str, token: str):
    req = urllib.request.Request(f"{BASE_URL}{path}")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def main():
    users = ["admin", "sef", "saha", "mudur"]
    tokens = {u: login(u) for u in users}

    print("RBAC_SMOKE")
    print("admin:/kullanicilar", get("/kullanicilar/", tokens["admin"]))
    print("sef:/kullanicilar", get("/kullanicilar/", tokens["sef"]))
    print("saha:/kullanicilar", get("/kullanicilar/", tokens["saha"]))
    print("mudur:/kullanicilar", get("/kullanicilar/", tokens["mudur"]))
    print("mudur:/raporlar/kpi", get("/raporlar/kpi", tokens["mudur"]))
    print("saha:/raporlar/kpi", get("/raporlar/kpi", tokens["saha"]))


if __name__ == "__main__":
    main()
