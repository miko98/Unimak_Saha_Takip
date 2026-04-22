from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from auth.security import decode_token


ROLE_YONETICI = "Yonetici"
ROLE_SEF = "Sef"
ROLE_SAHA = "Saha"
ROLE_MUDUR = "Mudur"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization token required")

    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Token missing subject")

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {"id": user.id, "isim": user.full_name, "rol": user.role, "kullanici_adi": user.kullanici_adi}


def require_roles(*allowed_roles: str):
    def role_guard(current_user=Depends(get_current_user)):
        if current_user["rol"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return role_guard

