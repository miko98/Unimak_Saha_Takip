from auth.security import create_token, decode_token, hash_password, verify_password


def test_hash_and_verify_password():
    password = "1234"
    stored = hash_password(password)
    assert stored.startswith("sha256$")
    assert verify_password(password, stored)
    assert not verify_password("wrong", stored)


def test_create_and_decode_token():
    token = create_token({"sub": "1", "role": "Yonetici"}, expires_in_minutes=5)
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["role"] == "Yonetici"
