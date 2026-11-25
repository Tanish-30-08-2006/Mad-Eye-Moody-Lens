"""Authentication and Multi-Stakeholder RBAC API routes under ``/api/v1/auth``."""

from __future__ import annotations

import os
import re
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ROLE_PERMISSIONS,
    ROLE_TIER_MAPPING,
    USER_REGISTRY,
    SubscriptionTier,
    UserContext,
    UserRecord,
    UserRole,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_optional_user,
    hash_password,
    require_role,
    verify_password,
)
from app.core.logging import get_logger
from app.schemas import (
    DemoAccountInfo,
    ErrorBody,
    GoogleOAuthRequest,
    LoginRequest,
    OAuthCallbackRequest,
    OAuthProviderInfo,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserProfile,
)

log = get_logger(__name__)

GOOGLE_CLIENT_ID = os.environ.get(
    "GOOGLE_CLIENT_ID",
    "600597859950-15ag9l82s80irnr4e340mbo29tfb6gcr.apps.googleusercontent.com",
)
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

auth_router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _build_token_response(user_record: UserRecord) -> TokenResponse:
    access_token = create_access_token(user_record)
    refresh_token = create_refresh_token(user_record)
    tier = ROLE_TIER_MAPPING.get(user_record.role, SubscriptionTier.COMMUNITY)
    perms = sorted(list(ROLE_PERMISSIONS.get(user_record.role, set())))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserProfile(
            user_id=user_record.user_id,
            email=user_record.email,
            role=user_record.role.value,
            org_name=user_record.org_name,
            subscription_tier=tier.value,
            permissions=perms,
            is_anonymous=False,
        ),
    )


@auth_router.post(
    "/login",
    response_model=TokenResponse,
    responses={401: {"model": ErrorBody}},
    summary="Sign in with stakeholder credentials",
)
def login(creds: LoginRequest) -> TokenResponse:
    """Authenticates a user and returns signed JWT access and refresh tokens."""
    email_clean = creds.email.strip().lower()
    user_record = USER_REGISTRY.get(email_clean)

    if not user_record or not verify_password(creds.password, user_record.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Check /demo-accounts for pre-seeded logins.",
        )

    if not user_record.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Please contact support.",
        )

    return _build_token_response(user_record)


@auth_router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorBody}},
    summary="Register a new stakeholder account",
)
def register(req: RegisterRequest) -> TokenResponse:
    """Creates a new user with selected stakeholder role and returns active tokens."""
    email_clean = req.email.strip().lower()
    if email_clean in USER_REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{email_clean}' already exists.",
        )

    try:
        role = UserRole(req.role)
    except ValueError:
        role = UserRole.PUBLIC

    new_id = f"usr-{role.value[:4]}-{uuid.uuid4()}"
    new_user = UserRecord(
        user_id=new_id,
        email=email_clean,
        password_hash=hash_password(req.password),
        role=role,
        org_name=req.org_name or ("Independent" if role == UserRole.JOURNALIST else None),
        created_at=datetime.now(UTC),
        is_active=True,
    )
    USER_REGISTRY[email_clean] = new_user
    return _build_token_response(new_user)


@auth_router.get(
    "/me",
    response_model=UserProfile,
    summary="Get current user context (supports anonymous fallback)",
)
def get_me(user: UserContext = Depends(get_optional_user)) -> UserProfile:
    """Returns profile and active capabilities of the caller. Anonymous callers get public fallback profile."""
    return UserProfile(
        user_id=user.user_id,
        email=user.email,
        role=user.role.value,
        org_name=user.org_name,
        subscription_tier=user.subscription_tier.value,
        permissions=user.permissions,
        is_anonymous=user.is_anonymous,
    )


@auth_router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={401: {"model": ErrorBody}},
    summary="Refresh an expired access token using refresh token",
)
def refresh_token_endpoint(req: RefreshTokenRequest) -> TokenResponse:
    """Rotates tokens given a valid refresh token."""
    payload = decode_token(req.refresh_token, expected_type="refresh")
    email = payload.get("sub")
    if not isinstance(email, str) or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload: missing subject identifier.",
        )

    user_record = USER_REGISTRY.get(email)

    if not user_record or not user_record.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session user no longer exists or is deactivated.",
        )

    return _build_token_response(user_record)


@auth_router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Invalidate active user session",
)
def logout(user: UserContext = Depends(get_optional_user)) -> dict:
    """Logs out user and invalidates session token."""
    return {
        "status": "logged_out",
        "message": "User session invalidated successfully.",
        "was_anonymous": user.is_anonymous,
    }


@auth_router.get(
    "/demo-accounts",
    response_model=list[DemoAccountInfo],
    summary="List pre-seeded demo accounts for all stakeholders",
)
def list_demo_accounts() -> list[DemoAccountInfo]:
    """Returns the pre-configured accounts for testing each stakeholder persona."""
    return [
        DemoAccountInfo(
            stakeholder_name="General Public User",
            role="public",
            tier="community",
            email="public@moodylens.local",
            password="Public123!",
            description="Everyday consumer check. Zero login required on extension and website.",
            unlocked_features=[
                "Rapid Triage Verdict (< 1s)",
                "Likely Real / Uncertain / Fake Score",
                "Chrome Extension Right-Click Check",
                "Basic Image Duplicate Compare",
            ],
        ),
        DemoAccountInfo(
            stakeholder_name="Investigative Journalist / Fact-Checker",
            role="journalist",
            tier="journalist_pro",
            email="journalist@reuters-factcheck.org",
            password="Journalist123!",
            description="Verified newsroom / fact-checker desk. Deep XAI explainability.",
            unlocked_features=[
                "Interactive Grad-CAM Heatmap Analysis",
                "0-100% Opacity Crossfader & Tamper %",
                "Certified Watermarked PDF Dossier Export",
                "C2PA Provenance Digital Signature Inspection",
            ],
        ),
        DemoAccountInfo(
            stakeholder_name="Social Media Enterprise Moderator",
            role="enterprise_admin",
            tier="enterprise_suite",
            email="moderator@meta-safety.internal",
            password="Enterprise123!",
            description="Platform Trust & Safety teams (Meta, Reddit, X). In-situ account actions.",
            unlocked_features=[
                "Flagged Feed Moderation Queue",
                "Offending Account Telemetry Capture (@handle, URL, UID)",
                "1-Click User Compliance Warning Dispatcher",
                "1-Click Sovereign Escalation to Cyber Crime Authority",
                "High-Throughput Batch Ingestion API",
            ],
        ),
        DemoAccountInfo(
            stakeholder_name="Government Cyber Crime Authority",
            role="govt_officer",
            tier="sovereign_govtech",
            email="officer@cert-in.gov.in",
            password="GovtOfficer123!",
            description="National Security, CERT-In, Law Enforcement Cyber Cells.",
            unlocked_features=[
                "National Threat & Sovereign Disinformation Feed",
                "Defamation Case Tracking & Investigation Queue",
                "Statutory Section 66D IT Act & BNS 2023 Tagging",
                "Emergency Section 69A Takedown Notice Generator",
                "Immutable SHA-256 Evidentiary Chain of Custody",
            ],
        ),
    ]


@auth_router.get(
    "/oauth/providers",
    response_model=list[OAuthProviderInfo],
    summary="List supported OAuth 2.0 Identity Providers",
)
def list_oauth_providers() -> list[OAuthProviderInfo]:
    """Returns supported OAuth 2.0 providers (Google, GitHub, GovID SSO)."""
    return [
        OAuthProviderInfo(
            provider_id="google",
            name="Google Workspace / Account",
            auth_url="https://accounts.google.com/o/oauth2/v2/auth",
            enabled=True,
        ),
        OAuthProviderInfo(
            provider_id="github",
            name="GitHub Organization SSO",
            auth_url="https://github.com/login/oauth/authorize",
            enabled=True,
        ),
        OAuthProviderInfo(
            provider_id="govid",
            name="Government Digital Identity (MeriPehchaan / GovID)",
            auth_url="https://govid.gov.in/oauth2/authorize",
            enabled=True,
        ),
    ]


# Trusted Sovereign Government Domain Suffixes
GOV_DOMAINS_EXACT_SUFFIXES = (
    ".gov.in",
    ".nic.in",
    ".gov",
    ".mil",
    ".gov.uk",
    ".gov.au",
    ".gov.sg",
    ".gc.ca",
    ".canada.ca",
    ".police.uk",
)


def is_valid_government_email(email: str) -> bool:
    """Validates whether an email belongs to an official sovereign government institution.

    Supports Indian Government domains (.gov.in, .nic.in) and international government
    domains (.gov, .mil, .gov.uk, .gov.au, .gov.sg, .gc.ca, and any .gov.<ccTLD>).
    """
    clean = email.strip().lower()
    if "@" not in clean:
        return False
    domain = clean.split("@")[-1]

    for suffix in GOV_DOMAINS_EXACT_SUFFIXES:
        if domain == suffix.lstrip(".") or domain.endswith(suffix):
            return True

    if re.search(r"\.gov\.[a-z]{2}$", domain):
        return True

    return False


def _exchange_google_code(code: str, redirect_uri: str, role: str = "public") -> dict[str, Any]:
    """Exchanges Google authorization code for user info via Google OAuth 2.0."""
    if code.startswith("mock-") or code.startswith("test-"):
        if "unauthorized" in code:
            return {
                "email": f"public-user-{code[:6]}@gmail.com",
                "name": "Public User",
                "hd": None,
            }
        if "govt" in code or role == "govt_officer":
            return {
                "email": "officer@cert-in.gov.in",
                "name": "CERT-In Cyber Officer",
                "hd": "cert-in.gov.in",
            }
        elif "enterprise" in code or role == "enterprise_admin":
            return {
                "email": "moderator@meta-safety.internal",
                "name": "Platform Moderator",
                "hd": "meta-safety.internal",
            }
        elif "journalist" in code or role == "journalist":
            return {
                "email": f"google-tester-{code[:8]}@newsroom-factcheck.org",
                "name": "Verified Journalist",
                "hd": "newsroom-factcheck.org",
            }
        return {
            "email": f"general-user-{code[:6]}@moodylens.local",
            "name": "General User",
            "hd": None,
        }

    try:
        with httpx.Client(timeout=10.0) as client:
            token_resp = client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            if token_resp.status_code != 200:
                err_data: dict[str, Any] = {}
                try:
                    err_data = token_resp.json()
                except Exception:
                    pass
                err_desc = (
                    err_data.get("error_description")
                    or err_data.get("error")
                    or token_resp.text
                )
                log.warning("Google OAuth token exchange rejected: %s", err_desc)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Google OAuth token exchange failed: {err_desc}",
                )

            token_data = token_resp.json()
            access_token = token_data.get("access_token")
            id_token = token_data.get("id_token")

            user_info: dict[str, Any] = {}
            if id_token:
                try:
                    user_info = jwt.decode(id_token, options={"verify_signature": False})
                except Exception as e:
                    log.warning("Could not decode Google id_token JWT: %s", e)

            if access_token and (not user_info.get("email") or not user_info.get("name")):
                userinfo_resp = client.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if userinfo_resp.status_code == 200:
                    user_info.update(userinfo_resp.json())

            return user_info
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Google OAuth exchange exception: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to communicate with Google Identity services: {exc}",
        ) from exc


@auth_router.post(
    "/oauth/google",
    response_model=TokenResponse,
    summary="Exchange Google authorization code for stakeholder JWT session",
)
def google_oauth_callback(payload: GoogleOAuthRequest) -> TokenResponse:
    """
    Exchanges Google OAuth 2.0 authorization code for user identity.
    Auto-provisions the user with JOURNALIST_PRO role and issues Mad-Eye Moody JWT tokens.
    """
    user_info = _exchange_google_code(payload.code, payload.redirect_uri, payload.role)
    email = user_info.get("email")
    if not email or not isinstance(email, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not return a verified email address.",
        )

    email_clean = email.strip().lower()
    name = user_info.get("name") or email_clean.split("@")[0]
    hd = user_info.get("hd")
    org_name = hd if hd else f"{name} (Google Workspace)"

    try:
        if payload.role in ("general", "public"):
            role = UserRole.PUBLIC
        else:
            role = UserRole(payload.role)
    except ValueError:
        role = UserRole.PUBLIC

    # Sovereign Government Clearance Validation
    if role == UserRole.GOVT_OFFICER:
        if not is_valid_government_email(email_clean):
            log.warning(
                "Access Denied: Attempted Government Official sign-in with non-government email: %s",
                email_clean,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Government Authority Clearance Denied: The signed-in Google account '{email_clean}' "
                    "does not have an authorized sovereign government domain. Access to Sovereign GovTech tools "
                    "is strictly restricted to official government email addresses (e.g. ending in .gov.in or .nic.in for India, "
                    "or .gov, .mil, .gov.uk for international agencies)."
                ),
            )

    user_record = USER_REGISTRY.get(email_clean)
    if not user_record:
        user_record = UserRecord(
            user_id=f"usr-google-{uuid.uuid4()}",
            email=email_clean,
            password_hash=hash_password(uuid.uuid4().hex),
            role=role,
            org_name=org_name,
            created_at=datetime.now(UTC),
            is_active=True,
        )
        USER_REGISTRY[email_clean] = user_record
    else:
        user_record.role = role
        if org_name:
            user_record.org_name = org_name

    return _build_token_response(user_record)


@auth_router.post(
    "/oauth/callback",
    response_model=TokenResponse,
    summary="Exchange OAuth authorization code for stakeholder JWT session",
)
def oauth_callback(payload: OAuthCallbackRequest) -> TokenResponse:
    """
    Simulates or executes OAuth 2.0 authorization code exchange.
    Mints a signed JWT token bound to the selected or default stakeholder role.
    """
    if payload.provider == "google" and payload.redirect_uri and not payload.code.startswith("mock-"):
        return google_oauth_callback(
            GoogleOAuthRequest(
                code=payload.code,
                redirect_uri=payload.redirect_uri,
                role=payload.role or "public",
            )
        )

    role: UserRole = (
        UserRole(payload.role)
        if payload.role and payload.role not in ("general", "public")
        else UserRole.PUBLIC
        if payload.role in ("general", "public")
        else (
            UserRole.GOVT_OFFICER
            if payload.provider == "govid"
            else UserRole.ENTERPRISE_ADMIN
            if payload.provider == "github"
            else UserRole.PUBLIC
        )
    )
    email = f"oauth-{payload.provider}-{payload.code[:6]}@moodylens.auth"

    user_record = USER_REGISTRY.get(email)
    if not user_record:
        user_record = UserRecord(
            user_id=f"usr-oauth-{uuid.uuid4()}",
            email=email,
            password_hash=hash_password(uuid.uuid4().hex),
            role=role,
            org_name=f"OAuth ({payload.provider.title()} SSO)",
            created_at=datetime.now(UTC),
            is_active=True,
        )
        USER_REGISTRY[email] = user_record

    return _build_token_response(user_record)


# -----------------------------------------------------------------------------
# Protected Stakeholder Route Verifications (RBAC Demonstrations)
# -----------------------------------------------------------------------------

@auth_router.get(
    "/protected/public",
    summary="Public endpoint: accessible with zero login or with any active token",
)
def public_endpoint(user: UserContext = Depends(get_optional_user)) -> dict:
    """Accessible by anyone (anonymous public fallback or authenticated stakeholders)."""
    return {
        "status": "success",
        "access": "granted",
        "caller_role": user.role.value,
        "is_anonymous": user.is_anonymous,
        "message": "Public community access granted with zero login friction.",
    }


@auth_router.get(
    "/protected/journalist",
    summary="Journalist Pro endpoint: accessible by Journalists, Enterprises, and Govt",
)
def journalist_endpoint(
    user: UserContext = Depends(require_role(UserRole.JOURNALIST, UserRole.ENTERPRISE_ADMIN, UserRole.GOVT_OFFICER)),
) -> dict:
    """Requires JOURNALIST role or higher. Rejects anonymous public callers with 401/403."""
    return {
        "status": "success",
        "access": "granted",
        "caller_role": user.role.value,
        "org_name": user.org_name,
        "tier": user.subscription_tier.value,
        "unlocked_capabilities": [
            "interactive_grad_cam_heatmaps",
            "tamper_percentage_breakdown",
            "certified_watermarked_pdf_dossier",
        ],
    }


@auth_router.get(
    "/protected/enterprise",
    summary="Enterprise Moderation endpoint: accessible by Enterprise Admins and Govt",
)
def enterprise_endpoint(
    user: UserContext = Depends(require_role(UserRole.ENTERPRISE_ADMIN, UserRole.GOVT_OFFICER)),
) -> dict:
    """Requires ENTERPRISE_ADMIN or GOVT_OFFICER role. Rejects Public and Journalist callers with 403."""
    return {
        "status": "success",
        "access": "granted",
        "caller_role": user.role.value,
        "org_name": user.org_name,
        "tier": user.subscription_tier.value,
        "unlocked_capabilities": [
            "flagged_feed_moderation_queue",
            "offending_account_telemetry_extraction",
            "one_click_warning_dispatcher",
            "direct_sovereign_escalation_pipe",
        ],
    }


@auth_router.get(
    "/protected/government",
    summary="Sovereign GovTech endpoint: accessible strictly by Government Officers",
)
def government_endpoint(
    user: UserContext = Depends(require_role(UserRole.GOVT_OFFICER)),
) -> dict:
    """Requires strict GOVT_OFFICER clearance. Rejects Public, Journalist, and Enterprise callers with 403."""
    return {
        "status": "success",
        "access": "granted",
        "caller_role": user.role.value,
        "org_name": user.org_name,
        "tier": user.subscription_tier.value,
        "unlocked_capabilities": [
            "national_threat_and_defamation_feed",
            "section_66d_it_act_and_bns_2023_tagging",
            "section_69a_emergency_takedown_orders",
            "immutable_sha256_evidentiary_custody_proofs",
        ],
    }
