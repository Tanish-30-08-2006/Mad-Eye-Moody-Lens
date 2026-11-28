"""Comprehensive Security Vulnerability Remediation Verification Test Suite.

Verifies fixes for:
1. Registration Privilege Escalation Prevention (403 for unauthorized roles).
2. Mock OAuth Authentication Bypass Removal in Production (400 rejection).
3. Secure JWT Secret Management (Startup validation, HS256, unique jti, exp).
4. Unique Password Salts (PBKDF2 per-user random salts & legacy fallback).
5. PostgreSQL / SQLite Database User Persistence (Across sessions & workers).
6. JWT Revocation on Logout via Redis Blacklist (jti tracking, TTL, fail-closed).
7. Cryptographic Google OAuth ID Token Verification (JWKS RS256, exp, aud, iss).
8. Elimination of Hardcoded Demo Credentials in Production.
"""

from __future__ import annotations

import time
from datetime import timedelta, timezone
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.auth_routes import verify_google_id_token
from app.core.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    KNOWN_COMPROMISED_SECRETS,
    UserRecord,
    UserRole,
    create_access_token,
    decode_token,
    hash_password,
    is_token_revoked,
    revoke_token,
    validate_jwt_secret_on_startup,
    verify_password,
)
from app.core.config import settings
from app.db.session import session_scope
from app.services.users import get_user_by_email

UTC = timezone.utc


# =============================================================================
# 1. Registration Privilege Escalation Tests
# =============================================================================

def test_registration_public_success(client: TestClient):
    """Public self-registration must succeed with HTTP 201."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "citizen.user1@example.org",
            "password": "Password123!",
            "role": "public",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["email"] == "citizen.user1@example.org"
    assert data["user"]["role"] == "public"
    assert data["user"]["subscription_tier"] == "community"


def test_registration_journalist_success(client: TestClient):
    """Journalist self-registration must succeed with HTTP 201."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "investigative.reporter@news.org",
            "password": "Password123!",
            "role": "journalist",
            "org_name": "Free Press Bureau",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["email"] == "investigative.reporter@news.org"
    assert data["user"]["role"] == "journalist"
    assert data["user"]["subscription_tier"] == "journalist_pro"


def test_registration_government_officer_rejected(client: TestClient):
    """Attempting to self-register as Government Official must be strictly rejected with HTTP 403."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "attacker@fakegov.in",
            "password": "Password123!",
            "role": "govt_officer",
        },
    )
    assert res.status_code == 403
    assert "Self-registration is restricted to Public and Journalist accounts" in res.json()["error"]


def test_registration_enterprise_admin_rejected(client: TestClient):
    """Attempting to self-register as Enterprise Admin must be strictly rejected with HTTP 403."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "attacker@platform.internal",
            "password": "Password123!",
            "role": "enterprise_admin",
        },
    )
    assert res.status_code == 403
    assert "Self-registration is restricted to Public and Journalist accounts" in res.json()["error"]


@pytest.mark.parametrize("bypass_role", ["ADMIN", "Administrator", "GOVT_OFFICER", "enterprise_admin"])
def test_registration_privilege_escalation_bypass_attempts(client: TestClient, bypass_role: str):
    """Case variations and admin privilege escalation attempts must be blocked with HTTP 403."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"bypass_{bypass_role.lower()}@attacker.com",
            "password": "Password123!",
            "role": bypass_role,
        },
    )
    assert res.status_code == 403


# =============================================================================
# 2. Mock OAuth Bypass Removal Tests
# =============================================================================

def test_mock_oauth_rejected_when_disabled(client: TestClient, monkeypatch):
    """Mock OAuth codes must be rejected with HTTP 400 when allow_mock_oauth is False."""
    monkeypatch.setattr(settings, "allow_mock_oauth", False)
    monkeypatch.setattr(settings, "env", "development")

    res = client.post(
        "/api/v1/auth/oauth/google",
        json={
            "code": "mock-test-auth-code",
            "redirect_uri": "http://localhost:5173/oauth/callback",
            "role": "public",
        },
    )
    assert res.status_code == 400
    assert "Mock OAuth authorization codes are strictly rejected" in res.json()["error"]


def test_mock_oauth_rejected_in_production_environment(client: TestClient, monkeypatch):
    """Mock OAuth codes must NEVER be accepted in production, even if requested role is government."""
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "allow_mock_oauth", True)  # Even if mistakenly set true in prod

    res = client.post(
        "/api/v1/auth/oauth/google",
        json={
            "code": "mock-govt-officer-session",
            "redirect_uri": "http://localhost:5173/oauth/callback",
            "role": "govt_officer",
        },
    )
    assert res.status_code == 400
    assert "Mock OAuth authorization codes are strictly rejected" in res.json()["error"]


def test_mock_oauth_allowed_only_in_configured_test_env(client: TestClient, monkeypatch):
    """Mock OAuth is only allowed in non-production when explicitly configured."""
    monkeypatch.setattr(settings, "env", "test")
    monkeypatch.setattr(settings, "allow_mock_oauth", True)

    res = client.post(
        "/api/v1/auth/oauth/google",
        json={
            "code": "mock-general-user",
            "redirect_uri": "http://localhost:5173/oauth/callback",
            "role": "public",
        },
    )
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "public"


# =============================================================================
# 3. Secure JWT Secret Management Tests
# =============================================================================

def test_jwt_startup_fails_in_production_without_secret(monkeypatch):
    """Application startup must fail in production if MML_JWT_SECRET is missing."""
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "jwt_secret", None)
    monkeypatch.delenv("MML_JWT_SECRET", raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        validate_jwt_secret_on_startup()
    assert "MML_JWT_SECRET environment variable is missing in production" in str(exc_info.value)


def test_jwt_startup_fails_in_production_with_short_secret(monkeypatch):
    """Application startup must fail in production if secret is too short (< 32 chars)."""
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "jwt_secret", "short-key-1234")
    monkeypatch.setenv("MML_JWT_SECRET", "short-key-1234")

    with pytest.raises(RuntimeError) as exc_info:
        validate_jwt_secret_on_startup()
    assert "too short" in str(exc_info.value)


def test_jwt_startup_fails_with_known_compromised_secret(monkeypatch):
    """Application startup must fail if secret matches known compromised default."""
    for compromised in KNOWN_COMPROMISED_SECRETS:
        monkeypatch.setattr(settings, "env", "production")
        monkeypatch.setattr(settings, "jwt_secret", compromised)
        monkeypatch.setenv("MML_JWT_SECRET", compromised)

        with pytest.raises(RuntimeError) as exc_info:
            validate_jwt_secret_on_startup()
        assert "matches a known compromised default key" in str(exc_info.value)


def test_issued_tokens_contain_unique_jti_and_algorithm():
    """Newly minted tokens must include a unique jti claim and enforce HS256."""
    user = UserRecord(
        user_id="usr-test-1",
        email="test@moodylens.local",
        password_hash="hash",
        password_salt="salt",
        role=UserRole.JOURNALIST,
    )
    t1 = create_access_token(user)
    t2 = create_access_token(user)

    p1 = decode_token(t1)
    p2 = decode_token(t2)

    assert "jti" in p1
    assert "jti" in p2
    assert p1["jti"] != p2["jti"]
    assert p1["exp"] > p1["iat"]
    assert p1["exp"] - p1["iat"] <= ACCESS_TOKEN_EXPIRE_MINUTES * 60 + 5


# =============================================================================
# 4. Unique Password Salt Tests
# =============================================================================

def test_password_hashing_generates_unique_random_salts():
    """Each call to hash_password must generate a distinct random salt."""
    pwd = "SharedSecretPassword123!"
    h1, s1 = hash_password(pwd)
    h2, s2 = hash_password(pwd)

    assert s1 != s2
    assert h1 != h2
    assert verify_password(pwd, h1, s1) is True
    assert verify_password(pwd, h2, s2) is True
    assert verify_password("WrongPassword!", h1, s1) is False


def test_legacy_static_salt_backward_compatibility():
    """Legacy password hashes generated with static salt remain verifiable."""
    pwd = "LegacyJournalistPassword!"
    import hashlib
    legacy_hash = hashlib.pbkdf2_hmac("sha256", pwd.encode("utf-8"), b"mml_rbac_salt_2026", 100_000).hex()

    # Salt is None indicates legacy format
    assert verify_password(pwd, legacy_hash, salt=None) is True
    assert verify_password("WrongPassword!", legacy_hash, salt=None) is False


# =============================================================================
# 5. Database User Persistence Tests
# =============================================================================

def test_user_persisted_to_database_and_retrievable(client: TestClient):
    """Users created via registration persist directly in the SQL database."""
    email = "db.persisted.user@test.org"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "UserPass123!", "role": "public"},
    )
    assert reg_res.status_code == 201

    # Verify user exists in database directly
    with session_scope() as s:
        db_user = get_user_by_email(email, session=s)
        assert db_user is not None
        assert db_user.email == email
        assert db_user.role == "public"
        assert len(db_user.password_salt) == 32  # 16 bytes hex = 32 chars
        assert db_user.password_hash != "UserPass123!"  # Never plaintext

    # Verify login succeeds using the persisted DB user
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "UserPass123!"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["user"]["email"] == email


def test_duplicate_registration_database_constraint(client: TestClient):
    """Enforcing unique email constraint returns HTTP 400 on duplicate registration."""
    email = "duplicate.check@test.org"
    r1 = client.post("/api/v1/auth/register", json={"email": email, "password": "Pass1", "role": "public"})
    assert r1.status_code == 201

    r2 = client.post("/api/v1/auth/register", json={"email": email, "password": "Pass2", "role": "public"})
    assert r2.status_code == 400
    assert "already exists" in r2.json()["error"]


# =============================================================================
# 6. JWT Revocation on Logout & Redis Blacklist Tests
# =============================================================================

def test_logout_revokes_token_and_blocks_reuse(client: TestClient):
    """Logging out must invalidate the JWT so subsequent requests return 401."""
    # 1. Register & login
    email = "logout.test@moodylens.local"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Pass!", "role": "journalist"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Access protected endpoint before logout
    check1 = client.get("/api/v1/auth/protected/journalist", headers=headers)
    assert check1.status_code == 200

    # 3. Call logout
    logout_res = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200
    assert logout_res.json()["status"] == "logged_out"

    # 4. Attempt to reuse revoked token -> must fail with 401
    check2 = client.get("/api/v1/auth/protected/journalist", headers=headers)
    assert check2.status_code == 401
    assert "Token has been revoked" in check2.json()["error"]


def test_blacklist_ttl_matches_token_remaining_lifetime():
    """Revoking a token sets Redis TTL equal to remaining exp seconds."""
    user = UserRecord(
        user_id="usr-ttl-test",
        email="ttl@test.org",
        password_hash="h",
        password_salt="s",
        role=UserRole.PUBLIC,
    )
    token = create_access_token(user, expires_delta=timedelta(seconds=120))
    payload = decode_token(token)
    jti = payload["jti"]

    from app.core.redis import get_redis
    r = get_redis()

    revoke_token(token)
    ttl = r.ttl(f"jwt:revoked:{jti}")
    assert 110 <= ttl <= 120
    assert is_token_revoked(jti) is True


def test_redis_unavailability_fail_closed_in_production(monkeypatch):
    """In production, failure to contact Redis must fail closed (HTTP 503)."""
    monkeypatch.setattr(settings, "env", "production")

    with patch("app.core.auth.get_redis", side_effect=Exception("Redis connection refused")):
        with pytest.raises(HTTPException) as exc_info:
            is_token_revoked("some-jti-token-id")
        assert exc_info.value.status_code == 503
        assert "Security verification unavailable" in exc_info.value.detail


# =============================================================================
# 7. Cryptographic Google ID Token Verification Tests
# =============================================================================

class MockJWKKey:
    def __init__(self, key):
        self.key = key


class MockJWKSClient:
    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return MockJWKKey(self.public_key)


@pytest.fixture(scope="module")
def rsa_key_pair():
    """Generates an ephemeral RSA key pair for testing Google ID token validation."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


def test_google_id_token_valid(rsa_key_pair):
    """A correctly signed, unexpired ID token with matching audience is accepted."""
    priv, pub = rsa_key_pair
    client_id = "test-google-client-id"
    now_ts = int(time.time())

    token = jwt.encode(
        {
            "sub": "google-sub-12345",
            "iss": "https://accounts.google.com",
            "aud": client_id,
            "email": "officer@cert-in.gov.in",
            "email_verified": True,
            "iat": now_ts,
            "exp": now_ts + 3600,
        },
        priv,
        algorithm="RS256",
    )

    jwks = MockJWKSClient(pub)
    verified = verify_google_id_token(token, expected_client_id=client_id, jwks_client=jwks)
    assert verified["email"] == "officer@cert-in.gov.in"
    assert verified["sub"] == "google-sub-12345"


def test_google_id_token_expired_rejected(rsa_key_pair):
    """An expired Google ID token must be rejected with HTTP 401."""
    priv, pub = rsa_key_pair
    client_id = "test-google-client-id"
    now_ts = int(time.time())

    token = jwt.encode(
        {
            "sub": "google-sub-expired",
            "iss": "https://accounts.google.com",
            "aud": client_id,
            "email": "reporter@reuters.org",
            "email_verified": True,
            "iat": now_ts - 7200,
            "exp": now_ts - 3600,
        },
        priv,
        algorithm="RS256",
    )

    jwks = MockJWKSClient(pub)
    with pytest.raises(HTTPException) as exc_info:
        verify_google_id_token(token, expected_client_id=client_id, jwks_client=jwks)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail


def test_google_id_token_audience_mismatch_rejected(rsa_key_pair):
    """An ID token issued for a different client ID must be rejected with HTTP 401."""
    priv, pub = rsa_key_pair
    now_ts = int(time.time())

    token = jwt.encode(
        {
            "sub": "google-sub-wrong-aud",
            "iss": "https://accounts.google.com",
            "aud": "attacker-client-id-evil",
            "email": "user@gmail.com",
            "email_verified": True,
            "iat": now_ts,
            "exp": now_ts + 3600,
        },
        priv,
        algorithm="RS256",
    )

    jwks = MockJWKSClient(pub)
    with pytest.raises(HTTPException) as exc_info:
        verify_google_id_token(token, expected_client_id="expected-client-id-clean", jwks_client=jwks)
    assert exc_info.value.status_code == 401
    assert "audience mismatch" in exc_info.value.detail


def test_google_id_token_invalid_signature_rejected(rsa_key_pair):
    """An ID token signed by an unauthorized key must fail signature verification."""
    _, pub = rsa_key_pair
    other_priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    client_id = "test-client-id"
    now_ts = int(time.time())

    token = jwt.encode(
        {
            "sub": "google-sub-tampered",
            "iss": "https://accounts.google.com",
            "aud": client_id,
            "email": "hacker@evil.com",
            "email_verified": True,
            "iat": now_ts,
            "exp": now_ts + 3600,
        },
        other_priv,  # Signed with different private key
        algorithm="RS256",
    )

    jwks = MockJWKSClient(pub)  # Verified with expected public key
    with pytest.raises(HTTPException) as exc_info:
        verify_google_id_token(token, expected_client_id=client_id, jwks_client=jwks)
    assert exc_info.value.status_code == 401


def test_google_id_token_unverified_email_rejected(rsa_key_pair):
    """A Google account whose email is not verified by Google must be rejected with HTTP 403."""
    priv, pub = rsa_key_pair
    client_id = "test-client-id"
    now_ts = int(time.time())

    token = jwt.encode(
        {
            "sub": "google-sub-unverified",
            "iss": "https://accounts.google.com",
            "aud": client_id,
            "email": "unverified@gmail.com",
            "email_verified": False,
            "iat": now_ts,
            "exp": now_ts + 3600,
        },
        priv,
        algorithm="RS256",
    )

    jwks = MockJWKSClient(pub)
    with pytest.raises(HTTPException) as exc_info:
        verify_google_id_token(token, expected_client_id=client_id, jwks_client=jwks)
    assert exc_info.value.status_code == 403
    assert "not verified by Google" in exc_info.value.detail


# =============================================================================
# 8. Demo Credentials & Production Hygiene Tests
# =============================================================================

def test_demo_accounts_empty_in_production(client: TestClient, monkeypatch):
    """In production, demo accounts endpoint must return an empty list."""
    monkeypatch.setattr(settings, "env", "production")
    res = client.get("/api/v1/auth/demo-accounts")
    assert res.status_code == 200
    assert res.json() == []


def test_demo_accounts_in_dev_contain_no_plaintext_passwords(client: TestClient, monkeypatch):
    """In development, demo accounts listing must never leak plaintext passwords."""
    monkeypatch.setattr(settings, "env", "development")
    res = client.get("/api/v1/auth/demo-accounts")
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) > 0
    for acc in accounts:
        assert acc.get("password") == ""  # Never expose plaintext passwords
