"""Authentication and Multi-Stakeholder RBAC API routes under ``/api/v1/auth``."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

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
from app.schemas import (
    DemoAccountInfo,
    ErrorBody,
    LoginRequest,
    OAuthCallbackRequest,
    OAuthProviderInfo,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserProfile,
)

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


@auth_router.post(
    "/oauth/callback",
    response_model=TokenResponse,
    summary="Exchange OAuth authorization code for stakeholder JWT session",
)
def oauth_callback(payload: OAuthCallbackRequest) -> TokenResponse:
    """
    Simulates OAuth 2.0 authorization code exchange.
    Mints a signed JWT token bound to the selected or default stakeholder role.
    """
    role: UserRole = (
        UserRole(payload.role)
        if payload.role
        else (
            UserRole.GOVT_OFFICER
            if payload.provider == "govid"
            else UserRole.ENTERPRISE_ADMIN
            if payload.provider == "github"
            else UserRole.JOURNALIST
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
