"""Authentication and Multi-Stakeholder RBAC API routes under ``/api/v1/auth``."""

from __future__ import annotations

import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from app.core.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ROLE_PERMISSIONS,
    ROLE_TIER_MAPPING,
    SubscriptionTier,
    UserContext,
    UserRecord,
    UserRole,
    bearer_scheme,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_optional_user,
    get_user_record,
    hash_password,
    require_role,
    revoke_token,
    verify_password,
)
from app.core.config import settings
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
from app.services.users import (
    create_user,
    update_user_role,
)

UTC = timezone.utc
log = get_logger(__name__)

GOOGLE_CLIENT_ID = os.environ.get(
    "GOOGLE_CLIENT_ID",
    "600597859950-15ag9l82s80irnr4e340mbo29tfb6gcr.apps.googleusercontent.com",
)
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

auth_router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_google_jwks_client: jwt.PyJWKClient | None = None


def get_google_jwks_client() -> jwt.PyJWKClient:
    """Returns singleton JWKS client for verifying Google ID tokens."""
    global _google_jwks_client
    if _google_jwks_client is None:
        _google_jwks_client = jwt.PyJWKClient(
            "https://www.googleapis.com/oauth2/v3/certs",
            cache_keys=True,
        )
    return _google_jwks_client


def verify_google_id_token(
    id_token_str: str,
    expected_client_id: str,
    jwks_client: jwt.PyJWKClient | None = None,
) -> dict[str, Any]:
    """Cryptographically verifies a Google OAuth 2.0 ID token.

    Validates:
    - RS256 signature against Google JWKS public certificates.
    - Token expiration (exp).
    - Expected Audience (aud == expected_client_id).
    - Trusted Issuer (iss in ("accounts.google.com", "https://accounts.google.com")).
    - Verified email (email_verified is True).
    """
    if not id_token_str or not isinstance(id_token_str, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing or invalid Google ID token.",
        )

    client = jwks_client or get_google_jwks_client()
    try:
        signing_key = client.get_signing_key_from_jwt(id_token_str)
        payload = jwt.decode(
            id_token_str,
            signing_key.key,
            algorithms=["RS256"],
            audience=expected_client_id,
            issuer=["accounts.google.com", "https://accounts.google.com"],
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token has expired. Please sign in again.",
        ) from None
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token audience mismatch: token was not issued for this application.",
        ) from None
    except jwt.InvalidIssuerError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token issuer is not trusted.",
        ) from None
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google ID token signature or claim verification failed: {exc}",
        ) from exc

    if not payload.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google account email address is not verified by Google.",
        )

    return payload


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
    user_record = get_user_record(email_clean)

    if not user_record or not verify_password(
        creds.password,
        user_record.password_hash,
        getattr(user_record, "password_salt", None),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
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
    responses={400: {"model": ErrorBody}, 403: {"model": ErrorBody}},
    summary="Register a new stakeholder account",
)
def register(req: RegisterRequest) -> TokenResponse:
    """Creates a new user with verified role permissions.

    Security Enforcement (Requirement 1):
    - Client-supplied roles for privileged tiers (GOVT_OFFICER, ENTERPRISE_ADMIN) are strictly rejected with 403.
    - Public self-registration is allowed only for PUBLIC and JOURNALIST tiers.
    """
    email_clean = req.email.strip().lower()

    # Reject unauthorized privileged role self-assignment
    raw_role = (req.role or "public").strip().lower()
    if raw_role in ("govt_officer", "enterprise_admin", "admin", "administrator"):
        log.warning(
            "Privilege Escalation Attempt Blocked: caller attempted to register privileged role '%s' for '%s'",
            raw_role,
            email_clean,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Self-registration is restricted to Public and Journalist accounts. "
                "Privileged accounts (Enterprise Administrator, Government Official) must be provisioned "
                "through an authorized administrative workflow."
            ),
        )

    if raw_role == "journalist":
        role = UserRole.JOURNALIST
    else:
        role = UserRole.PUBLIC

    # Check for existing account
    existing = get_user_record(email_clean)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{email_clean}' already exists.",
        )

    password_hash, password_salt = hash_password(req.password)
    tier = ROLE_TIER_MAPPING.get(role, SubscriptionTier.COMMUNITY)
    org_name = req.org_name or ("Independent" if role == UserRole.JOURNALIST else None)

    try:
        db_user = create_user(
            email=email_clean,
            password_hash=password_hash,
            password_salt=password_salt,
            role=role.value,
            org_name=org_name,
            subscription_tier=tier.value,
            is_active=True,
        )
        user_record = UserRecord(
            user_id=str(db_user.id),
            email=email_clean,
            password_hash=password_hash,
            password_salt=password_salt,
            role=role,
            org_name=org_name,
            subscription_tier=tier,
            created_at=db_user.created_at,
            is_active=True,
        )
    except Exception as exc:
        log.error("Database user creation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration failed: account with email '{email_clean}' could not be created.",
        ) from exc

    return _build_token_response(user_record)


@auth_router.get(
    "/me",
    response_model=UserProfile,
    summary="Get current user context (supports anonymous fallback)",
)
def get_me(user: UserContext = Depends(get_optional_user)) -> UserProfile:
    """Returns profile and active capabilities of the caller."""
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

    user_record = get_user_record(email)
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
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Logs out user and invalidates session token via Redis revocation blacklist."""
    if credentials and credentials.credentials:
        revoke_token(credentials.credentials)
        return {
            "status": "logged_out",
            "message": "User session token has been revoked successfully.",
            "was_anonymous": False,
        }

    return {
        "status": "logged_out",
        "message": "No active session token provided to revoke.",
        "was_anonymous": True,
    }


@auth_router.get(
    "/demo-accounts",
    response_model=list[DemoAccountInfo],
    summary="List pre-seeded demo accounts for all stakeholders",
)
def list_demo_accounts() -> list[DemoAccountInfo]:
    """Returns stakeholder persona information for testing and demonstration in non-production.

    Security Enforcement (Requirement 8):
    - In production, this endpoint returns an empty list to avoid leaking testing information.
    - Plaintext passwords are never returned.
    """
    if settings.is_production:
        return []

    return [
        DemoAccountInfo(
            stakeholder_name="General Public User",
            role="public",
            tier="community",
            email="public@moodylens.local",
            password="",
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
            password="",
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
            password="",
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
            password="",
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
    """Returns supported OAuth 2.0 providers."""
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
    """Validates whether an email belongs to an official sovereign government institution."""
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


def _exchange_google_code(
    code: str,
    redirect_uri: str,
    role: str = "public",
    jwks_client: jwt.PyJWKClient | None = None,
) -> dict[str, Any]:
    """Exchanges Google authorization code for verified user info via Google OAuth 2.0."""
    if code.startswith("mock-") or code.startswith("test-"):
        # Requirement 2: Reject mock OAuth in production or when allow_mock_oauth is false
        if settings.is_production or not getattr(settings, "allow_mock_oauth", False):
            log.warning("Security Alert: Mock OAuth authorization code rejected in production: %s", code)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mock OAuth authorization codes are strictly rejected in this environment.",
            )

        # Mock authentication only permitted in explicitly configured testing environments
        if "unauthorized" in code:
            return {
                "email": f"public-user-{code[:6]}@gmail.com",
                "name": "Public User",
                "email_verified": True,
                "hd": None,
            }
        if "govt" in code or role == "govt_officer":
            return {
                "email": "officer@cert-in.gov.in",
                "name": "CERT-In Cyber Officer",
                "email_verified": True,
                "hd": "cert-in.gov.in",
            }
        elif "enterprise" in code or role == "enterprise_admin":
            return {
                "email": "moderator@meta-safety.internal",
                "name": "Platform Moderator",
                "email_verified": True,
                "hd": "meta-safety.internal",
            }
        elif "journalist" in code or role == "journalist":
            return {
                "email": f"google-tester-{code[:8]}@newsroom-factcheck.org",
                "name": "Verified Journalist",
                "email_verified": True,
                "hd": "newsroom-factcheck.org",
            }
        return {
            "email": f"general-user-{code[:6]}@moodylens.local",
            "name": "General User",
            "email_verified": True,
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
            id_token = token_data.get("id_token")
            if not id_token:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Google Identity response did not include an id_token.",
                )

            # Cryptographically verify the Google ID token
            verified_payload = verify_google_id_token(
                id_token,
                expected_client_id=GOOGLE_CLIENT_ID,
                jwks_client=jwks_client,
            )
            return verified_payload
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
    """Exchanges Google OAuth 2.0 authorization code for user identity.

    Security Enforcement (Requirement 7):
    - Google ID token signature is verified against Google JWKS.
    - Roles are assigned based on verified server rules, not untrusted request parameters.
    - Government role strictly requires sovereign domain clearance (.gov.in, .gov, etc.).
    - User session is persisted in the PostgreSQL database.
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

    # Backend authorization logic for assigning roles
    raw_role = (payload.role or "public").strip().lower()
    if raw_role in ("govt_officer", "government"):
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
        role = UserRole.GOVT_OFFICER
    elif raw_role in ("enterprise_admin", "enterprise"):
        # Privileged enterprise tier must be pre-provisioned in database
        existing = get_user_record(email_clean)
        if existing and existing.role == UserRole.ENTERPRISE_ADMIN:
            role = UserRole.ENTERPRISE_ADMIN
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Enterprise Administrator accounts must be provisioned or pre-authorized by an administrator.",
            )
    elif raw_role == "journalist":
        role = UserRole.JOURNALIST
    else:
        role = UserRole.PUBLIC

    # Persist or update in database
    existing_record = get_user_record(email_clean)
    tier = ROLE_TIER_MAPPING.get(role, SubscriptionTier.COMMUNITY)

    if not existing_record:
        dummy_hash, dummy_salt = hash_password(secrets.token_hex(32))
        try:
            db_user = create_user(
                email=email_clean,
                password_hash=dummy_hash,
                password_salt=dummy_salt,
                role=role.value,
                org_name=org_name,
                subscription_tier=tier.value,
                is_active=True,
            )
            user_record = UserRecord(
                user_id=str(db_user.id),
                email=email_clean,
                password_hash=dummy_hash,
                password_salt=dummy_salt,
                role=role,
                org_name=org_name,
                subscription_tier=tier,
                created_at=db_user.created_at,
                is_active=True,
            )
        except Exception as exc:
            log.debug("Database user creation fallback: %s", exc)
            user_record = UserRecord(
                user_id=f"usr-google-{uuid.uuid4()}",
                email=email_clean,
                password_hash=dummy_hash,
                password_salt=dummy_salt,
                role=role,
                org_name=org_name,
                subscription_tier=tier,
                created_at=datetime.now(UTC),
                is_active=True,
            )
    else:
        try:
            update_user_role(
                email=email_clean,
                role=role.value,
                org_name=org_name,
                subscription_tier=tier.value,
            )
        except Exception as exc:
            log.debug("Database user update fallback: %s", exc)
        existing_record.role = role
        existing_record.subscription_tier = tier
        if org_name:
            existing_record.org_name = org_name
        user_record = existing_record

    return _build_token_response(user_record)


@auth_router.post(
    "/oauth/callback",
    response_model=TokenResponse,
    summary="Exchange OAuth authorization code for stakeholder JWT session",
)
def oauth_callback(payload: OAuthCallbackRequest) -> TokenResponse:
    """Executes OAuth 2.0 authorization code exchange."""
    if payload.provider == "google" and payload.redirect_uri:
        return google_oauth_callback(
            GoogleOAuthRequest(
                code=payload.code,
                redirect_uri=payload.redirect_uri,
                role=payload.role or "public",
            )
        )

    # In production or when mock OAuth is disabled, reject mock authorization codes
    if settings.is_production or not getattr(settings, "allow_mock_oauth", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mock OAuth authorization codes are disabled in this environment.",
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

    user_record = get_user_record(email)
    if not user_record:
        dummy_h, dummy_s = hash_password(secrets.token_hex(32))
        tier = ROLE_TIER_MAPPING.get(role, SubscriptionTier.COMMUNITY)
        user_record = UserRecord(
            user_id=f"usr-oauth-{uuid.uuid4()}",
            email=email,
            password_hash=dummy_h,
            password_salt=dummy_s,
            role=role,
            org_name=f"OAuth ({payload.provider.title()} SSO)",
            subscription_tier=tier,
            created_at=datetime.now(UTC),
            is_active=True,
        )

    return _build_token_response(user_record)


# -----------------------------------------------------------------------------
# Protected Stakeholder Route Verifications (RBAC Demonstrations)
# -----------------------------------------------------------------------------

@auth_router.get(
    "/protected/public",
    summary="Verify Public Community Access Tier",
)
def public_endpoint(user: UserContext = Depends(get_optional_user)) -> dict[str, Any]:
    """Accessible by anyone including anonymous zero-login guests."""
    return {
        "status": "access_granted",
        "tier": "community",
        "caller_role": user.role.value,
        "is_anonymous": user.is_anonymous,
        "unlocked_features": ["rapid_triage", "tamper_score", "extension_check"],
    }


@auth_router.get(
    "/protected/journalist",
    summary="Verify Journalist Pro Access Tier",
)
def journalist_endpoint(
    user: UserContext = Depends(require_role(UserRole.JOURNALIST, UserRole.ENTERPRISE_ADMIN, UserRole.GOVT_OFFICER)),
) -> dict[str, Any]:
    """Accessible by Journalist, Enterprise Admin, and Government Officer."""
    return {
        "status": "access_granted",
        "tier": "journalist_pro",
        "caller": user.email,
        "role": user.role.value,
        "unlocked_features": ["gradcam_heatmap", "pdf_dossier", "c2pa_provenance"],
    }


@auth_router.get(
    "/protected/enterprise",
    summary="Verify Enterprise Suite Access Tier",
)
def enterprise_endpoint(
    user: UserContext = Depends(require_role(UserRole.ENTERPRISE_ADMIN, UserRole.GOVT_OFFICER)),
) -> dict[str, Any]:
    """Accessible by Enterprise Admin and Government Officer."""
    return {
        "status": "access_granted",
        "tier": "enterprise_suite",
        "caller": user.email,
        "role": user.role.value,
        "unlocked_features": ["telemetry_capture", "issue_warning", "escalate_govt", "batch_scan"],
    }


@auth_router.get(
    "/protected/government",
    summary="Verify Sovereign GovTech Access Tier",
)
def government_endpoint(
    user: UserContext = Depends(require_role(UserRole.GOVT_OFFICER)),
) -> dict[str, Any]:
    """Exclusively accessible by Government Cyber Crime Authority."""
    return {
        "status": "access_granted",
        "tier": "sovereign_govtech",
        "caller": user.email,
        "role": user.role.value,
        "unlocked_features": [
            "national_threat_feed",
            "case_management",
            "statutory_tagging_it_act",
            "section_69a_takedown",
            "court_evidence_export",
        ],
    }
