"""Unit and regression tests for Multi-Stakeholder OAuth 2.0 / JWT Auth & RBAC."""

from __future__ import annotations

import io
from PIL import Image
import pytest
from fastapi.testclient import TestClient


def test_anonymous_public_fallback(client: TestClient):
    """Anonymous public user without token gets public fallback context with zero login."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert data["is_anonymous"] is True
    assert data["role"] == "public"
    assert data["subscription_tier"] == "community"
    assert "analyze:basic" in data["permissions"]

    # Test protected public endpoint
    pub = client.get("/api/v1/auth/protected/public")
    assert pub.status_code == 200
    assert pub.json()["caller_role"] == "public"
    assert pub.json()["is_anonymous"] is True


def test_demo_accounts_listing(client: TestClient):
    """Verify demo accounts endpoint exposes credentials for all 4 stakeholder personas."""
    res = client.get("/api/v1/auth/demo-accounts")
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) == 4
    roles = {acc["role"] for acc in accounts}
    assert roles == {"public", "journalist", "enterprise_admin", "govt_officer"}


def test_login_and_token_generation(client: TestClient):
    """Test successful login for all 4 pre-seeded stakeholder accounts."""
    stakeholders = [
        ("public@moodylens.local", "Public123!", "public", "community"),
        ("journalist@reuters-factcheck.org", "Journalist123!", "journalist", "journalist_pro"),
        ("moderator@meta-safety.internal", "Enterprise123!", "enterprise_admin", "enterprise_suite"),
        ("officer@cert-in.gov.in", "GovtOfficer123!", "govt_officer", "sovereign_govtech"),
    ]

    for email, pwd, expected_role, expected_tier in stakeholders:
        res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert res.status_code == 200, f"Failed for {email}: {res.text}"
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["role"] == expected_role
        assert data["user"]["subscription_tier"] == expected_tier
        assert data["user"]["is_anonymous"] is False


def test_invalid_login_credentials(client: TestClient):
    """Invalid password or email returns 401."""
    res = client.post("/api/v1/auth/login", json={"email": "journalist@reuters-factcheck.org", "password": "WrongPassword!"})
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["error"]


def test_token_refresh(client: TestClient):
    """Refresh token can be exchanged for a new access token."""
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "journalist@reuters-factcheck.org", "password": "Journalist123!"},
    )
    tokens = login_res.json()
    refresh_token = tokens["refresh_token"]

    ref_res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert ref_res.status_code == 200
    ref_data = ref_res.json()
    assert "access_token" in ref_data
    assert ref_data["user"]["role"] == "journalist"


def test_rbac_gatekeeping(client: TestClient):
    """
    Verify RBAC permission boundaries:
    - Anonymous: blocked from journalist (401), enterprise (401), govt (401)
    - Public: blocked from journalist (403), enterprise (403), govt (403)
    - Journalist: allowed on journalist (200), blocked from enterprise (403), govt (403)
    - Enterprise: allowed on journalist (200), enterprise (200), blocked from govt (403)
    - Govt: allowed on all three (200)
    """
    # 1. Anonymous caller
    assert client.get("/api/v1/auth/protected/journalist").status_code == 401
    assert client.get("/api/v1/auth/protected/enterprise").status_code == 401
    assert client.get("/api/v1/auth/protected/government").status_code == 401

    # 2. Public authenticated caller
    pub_token = client.post(
        "/api/v1/auth/login", json={"email": "public@moodylens.local", "password": "Public123!"}
    ).json()["access_token"]
    pub_headers = {"Authorization": f"Bearer {pub_token}"}

    assert client.get("/api/v1/auth/protected/public", headers=pub_headers).status_code == 200
    assert client.get("/api/v1/auth/protected/journalist", headers=pub_headers).status_code == 403
    assert client.get("/api/v1/auth/protected/enterprise", headers=pub_headers).status_code == 403
    assert client.get("/api/v1/auth/protected/government", headers=pub_headers).status_code == 403

    # 3. Journalist caller
    journo_token = client.post(
        "/api/v1/auth/login",
        json={"email": "journalist@reuters-factcheck.org", "password": "Journalist123!"},
    ).json()["access_token"]
    journo_headers = {"Authorization": f"Bearer {journo_token}"}

    assert client.get("/api/v1/auth/protected/journalist", headers=journo_headers).status_code == 200
    assert client.get("/api/v1/auth/protected/enterprise", headers=journo_headers).status_code == 403
    assert client.get("/api/v1/auth/protected/government", headers=journo_headers).status_code == 403

    # 4. Enterprise caller
    ent_token = client.post(
        "/api/v1/auth/login",
        json={"email": "moderator@meta-safety.internal", "password": "Enterprise123!"},
    ).json()["access_token"]
    ent_headers = {"Authorization": f"Bearer {ent_token}"}

    assert client.get("/api/v1/auth/protected/journalist", headers=ent_headers).status_code == 200
    assert client.get("/api/v1/auth/protected/enterprise", headers=ent_headers).status_code == 200
    assert client.get("/api/v1/auth/protected/government", headers=ent_headers).status_code == 403

    # 5. Government caller
    govt_token = client.post(
        "/api/v1/auth/login",
        json={"email": "officer@cert-in.gov.in", "password": "GovtOfficer123!"},
    ).json()["access_token"]
    govt_headers = {"Authorization": f"Bearer {govt_token}"}

    assert client.get("/api/v1/auth/protected/journalist", headers=govt_headers).status_code == 200
    assert client.get("/api/v1/auth/protected/enterprise", headers=govt_headers).status_code == 200
    assert client.get("/api/v1/auth/protected/government", headers=govt_headers).status_code == 200


def test_user_registration(client: TestClient):
    """Users can register with custom email and role."""
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new-reporter@bbc.co.uk",
            "password": "ReporterPass123!",
            "role": "journalist",
            "org_name": "BBC Verify",
        },
    )
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert data["user"]["email"] == "new-reporter@bbc.co.uk"
    assert data["user"]["role"] == "journalist"
    assert data["user"]["subscription_tier"] == "journalist_pro"
    assert data["user"]["org_name"] == "BBC Verify"

    # Verify duplicate registration is rejected
    dup_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new-reporter@bbc.co.uk",
            "password": "AnotherPassword!",
            "role": "journalist",
        },
    )
    assert dup_res.status_code == 400


def test_oauth_providers_and_callback(client: TestClient):
    """OAuth provider catalog and mock authorization code exchange."""
    prov_res = client.get("/api/v1/auth/oauth/providers")
    assert prov_res.status_code == 200
    providers = prov_res.json()
    assert any(p["provider_id"] == "google" for p in providers)
    assert any(p["provider_id"] == "govid" for p in providers)

    # Test OAuth callback for GovID
    cb_res = client.post(
        "/api/v1/auth/oauth/callback",
        json={"provider": "govid", "code": "gov-auth-code-12345"},
    )
    assert cb_res.status_code == 200
    cb_data = cb_res.json()
    assert cb_data["user"]["role"] == "govt_officer"
    assert "access_token" in cb_data


def test_zero_login_public_image_analysis_unaffected(client: TestClient):
    """Verify core analysis remains 100% accessible to anonymous users without login."""
    img = Image.new("RGB", (64, 64), color=(120, 180, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    # Call /api/v1/analyze/image with no authorization header
    res = client.post("/api/v1/analyze/image", files={"file": ("photo.png", buf, "image/png")})
    assert res.status_code == 200
    body = res.json()
    assert "verdict" in body
    assert "fake_probability" in body
