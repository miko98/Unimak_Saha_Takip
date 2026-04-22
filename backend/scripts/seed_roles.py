import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal
import models
from auth.security import hash_password


DEFAULT_PASSWORD = "1234"

SEED_USERS = [
    {"kullanici_adi": "admin", "full_name": "Yönetici", "role": "Yonetici"},
    {"kullanici_adi": "sef", "full_name": "Saha Şefi", "role": "Sef"},
    {"kullanici_adi": "saha", "full_name": "Saha Çalışanı", "role": "Saha"},
    {"kullanici_adi": "mudur", "full_name": "Genel Müdür", "role": "Mudur"},
]


def upsert_user(db, user_data):
    user = db.query(models.User).filter(models.User.kullanici_adi == user_data["kullanici_adi"]).first()
    if user:
        user.full_name = user_data["full_name"]
        user.role = user_data["role"]
        user.sifre = DEFAULT_PASSWORD
        user.hashed_password = hash_password(DEFAULT_PASSWORD)
        user.is_active = 1
        return f"updated:{user.kullanici_adi}"

    db.add(
        models.User(
            kullanici_adi=user_data["kullanici_adi"],
            full_name=user_data["full_name"],
            role=user_data["role"],
            sifre=DEFAULT_PASSWORD,
            hashed_password=hash_password(DEFAULT_PASSWORD),
            is_active=1,
        )
    )
    return f"created:{user_data['kullanici_adi']}"


def main():
    db = SessionLocal()
    try:
        results = [upsert_user(db, u) for u in SEED_USERS]
        db.commit()
        print("SEED_OK")
        print("PASSWORD", DEFAULT_PASSWORD)
        print("RESULTS", ",".join(results))
    finally:
        db.close()


if __name__ == "__main__":
    main()
