import base64
import hashlib
import hmac
import json
import os
import time


SECRET_KEY = os.getenv("UNIMAK_SECRET_KEY", "dev-only-change-this-key")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("UNIMAK_ACCESS_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_MINUTES = int(os.getenv("UNIMAK_REFRESH_MINUTES", "43200"))


def hash_password(password: str) -> str:
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return f"sha256${digest}"


def verify_password(plain_password: str, stored_password: str | None) -> bool:
    if not stored_password:
        return False
    if stored_password.startswith("sha256$"):
        return hmac.compare_digest(hash_password(plain_password), stored_password)
    return hmac.compare_digest(plain_password, stored_password)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("utf-8"))


def _sign(payload_segment: str) -> str:
    sig = hmac.new(
        SECRET_KEY.encode("utf-8"),
        payload_segment.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(sig)


def create_token(payload: dict, expires_in_minutes: int) -> str:
    token_payload = {
        **payload,
        "iat": int(time.time()),
        "exp": int(time.time() + (expires_in_minutes * 60)),
    }
    encoded_payload = _b64url_encode(
        json.dumps(token_payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    )
    signature = _sign(encoded_payload)
    return f"{encoded_payload}.{signature}"


def decode_token(token: str) -> dict:
    try:
        payload_segment, signature = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid token format") from exc

    expected_signature = _sign(payload_segment)
    if not hmac.compare_digest(signature, expected_signature):
        raise ValueError("Invalid token signature")

    payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Token expired")
    return payload

