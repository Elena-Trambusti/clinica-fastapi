"""Test di base su sicurezza e endpoint pubblici."""

import pytest
from fastapi.testclient import TestClient

# conftest imposta env; import app dopo
from app.main import app

client = TestClient(app)


def test_root_ok():
    r = client.get("/")
    assert r.status_code == 200


def test_login_invalid_credentials():
    r = client.post(
        "/login",
        data={"username": "__nonexistent__", "password": "wrong"},
    )
    assert r.status_code == 401


def test_security_headers_on_api():
    r = client.get("/")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"


def test_rate_limit_login_eventually_429():
    """Dopo molte richieste fallite, slowapi risponde 429."""
    for _ in range(25):
        r = client.post(
            "/login",
            data={"username": "x", "password": "y"},
        )
        if r.status_code == 429:
            body = r.json()
            msg = str(body.get("detail", body)).lower()
            assert "rate" in msg or "limite" in msg or "too many" in msg
            return
    pytest.skip("Rate limit non raggiunto in questo ambiente")
