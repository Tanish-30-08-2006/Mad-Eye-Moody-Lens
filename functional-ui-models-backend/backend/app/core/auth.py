"""Multi-Stakeholder OAuth 2.0 / JWT Authentication & Role-Based Access Control (RBAC).

Provides:
- Role hierarchy: PUBLIC (anonymous), JOURNALIST, ENTERPRISE_ADMIN, GOVT_OFFICER.
- Subscription tiers: COMMUNITY, JOURNALIST_PRO, ENTERPRISE_SUITE, SOVEREIGN_GOVTECH.
- Zero-login anonymous fallback for everyday public users.
- Cryptographically signed JWT tokens with claims (role, org, tier, permissions).
- FastAPI dependency injection (get_optional_user, get_current_user, require_role).
- Demo stakeholder accounts for seamless testing and grading.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

# -----------------------------------------------------------------------------
# Roles, Tiers & Permissions
# -----------------------------------------------------------------------------

class UserRole(StrEnum):
    PUBLIC = "public"
    JOURNALIST = "journalist"
    ENTERPRISE_ADMIN = "enterprise_admin"
    GOVT_OFFICER = "govt_officer"


class SubscriptionTier(StrEnum):
    COMMUNITY = "community"                  # Free / Public good
    JOURNALIST_PRO = "journalist_pro"        # Media License (heatmaps + dossier)
    ENTERPRISE_SUITE = "enterprise_suite"    # B2B SaaS (Meta, Reddit: telemetry + warning)
    SOVEREIGN_GOVTECH = "sovereign_govtech"  # Institutional (law enforcement + case tracking)


ROLE_TIER_MAPPING: dict[UserRole, SubscriptionTier] = {
    UserRole.PUBLIC: SubscriptionTier.COMMUNITY,
    UserRole.JOURNALIST: SubscriptionTier.JOURNALIST_PRO,
    UserRole.ENTERPRISE_ADMIN: SubscriptionTier.ENTERPRISE_SUITE,
    UserRole.GOVT_OFFICER: SubscriptionTier.SOVEREIGN_GOVTECH,
}

# Granular permissions assigned per role
ROLE_PERMISSIONS: dict[UserRole, set[str]] = {
    UserRole.PUBLIC: {
        "analyze:basic",
        "compare:duplicate",
        "read:verdict",
    },
    UserRole.JOURNALIST: {
        "analyze:basic",
        "compare:duplicate",
        "read:verdict",
        "analyze:heatmap",
        "export:pdf_dossier",
        "read:provenance",
    },
    UserRole.ENTERPRISE_ADMIN: {
        "analyze:basic",
        "compare:duplicate",
        "read:verdict",
        "analyze:heatmap",
        "export:pdf_dossier",
        "read:provenance",
        "telemetry:extract",
        "action:issue_warning",
        "action:escalate_govt",
        "enterprise:batch_scan",
    },
    UserRole.GOVT_OFFICER: {
        "analyze:basic",
        "compare:duplicate",
        "read:verdict",
        "analyze:heatmap",
        "export:pdf_dossier",
        "read:provenance",
        "telemetry:extract",
        "gov:view_threats",
        "gov:manage_cases",
        "gov:issue_takedown",
        "gov:export_court_evidence",
    },
}


# -----------------------------------------------------------------------------
# Security Settings & Token Constants
# -----------------------------------------------------------------------------

JWT_SECRET = getattr(settings, "jwt_secret", None) or os.getenv(
    "MML_JWT_SECRET", "mad-eye-moody-lens-rbac-secret-key-35-it314"
)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120
REFRESH_TOKEN_EXPIRE_DAYS = 7


def hash_password(password: str) -> str:
    """PBKDF2-HMAC-SHA256 password hashing without heavy native dependencies."""
    salt = b"mml_rbac_salt_2026"
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000).hex()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hmac.compare_digest(hash_password(plain_password), hashed_password)


# -----------------------------------------------------------------------------
# User Context & In-Memory Store
# -----------------------------------------------------------------------------

class UserContext(BaseModel):
    user_id: str | None = None
    email: str
    role: UserRole
    org_name: str | None = None
    subscription_tier: SubscriptionTier
    permissions: list[str] = Field(default_factory=list)
    is_anonymous: bool = False

    def has_permission(self, perm: str) -> bool:
        return perm in self.permissions


class UserRecord(BaseModel):
    user_id: str
    email: str
    password_hash: str
    role: UserRole
    org_name: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    is_active: bool = True


# Pre-seeded stakeholder accounts for instant evaluation and demo workflows
PRESEEDED_USERS: dict[str, UserRecord] = {
    "public@moodylens.local": UserRecord(
        user_id="usr-public-00000000-0001",
        email="public@moodylens.local",
        password_hash=hash_password("Public123!"),
        role=UserRole.PUBLIC,
        org_name="Community Member",
    ),
    "journalist@reuters-factcheck.org": UserRecord(
        user_id="usr-journo-00000000-0002",
        email="journalist@reuters-factcheck.org",
        password_hash=hash_password("Journalist123!"),
        role=UserRole.JOURNALIST,
        org_name="Reuters Fact-Check Bureau",
    ),
    "moderator@meta-safety.internal": UserRecord(
        user_id="usr-ent-00000000-0003",
        email="moderator@meta-safety.internal",
        password_hash=hash_password("Enterprise123!"),
        role=UserRole.ENTERPRISE_ADMIN,
        org_name="Meta Trust & Safety Operations",
    ),
    "officer@cert-in.gov.in": UserRecord(
        user_id="usr-govt-00000000-0004",
        email="officer@cert-in.gov.in",
        password_hash=hash_password("GovtOfficer123!"),
        role=UserRole.GOVT_OFFICER,
        org_name="CERT-In / National Cyber Crime Cell",
    ),
}

# Dynamic in-memory user registry extending preseeded users
USER_REGISTRY: dict[str, UserRecord] = dict(PRESEEDED_USERS)


# -----------------------------------------------------------------------------
# JWT Token Generation & Verification
# -----------------------------------------------------------------------------

def create_access_token(
    user: UserRecord,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    role_perms = sorted(list(ROLE_PERMISSIONS.get(user.role, set())))
    tier = ROLE_TIER_MAPPING.get(user.role, SubscriptionTier.COMMUNITY)

    payload = {
        "sub": user.email,
        "user_id": user.user_id,
        "role": user.role.value,
        "org_name": user.org_name,
        "tier": tier.value,
        "permissions": role_perms,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    user: UserRecord,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    payload = {
        "sub": user.email,
        "user_id": user.user_id,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token type (expected '{expected_type}')",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please refresh your session.",
        ) from None
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {e}",
        ) from e


# -----------------------------------------------------------------------------
# FastAPI Dependencies & Anonymous Fallback
# -----------------------------------------------------------------------------

bearer_scheme = HTTPBearer(auto_error=False)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserContext:
    """
    Core RBAC Dependency with Zero-Login Anonymous Fallback:
    - If valid Bearer JWT is supplied: returns authenticated stakeholder UserContext.
    - If no Authorization header is present: returns anonymous PUBLIC UserContext.
    - If invalid/expired token is supplied: raises 401 Unauthorized.
    """
    if credentials is None or not credentials.credentials:
        # Zero-login anonymous fallback
        return UserContext(
            user_id=None,
            email="anonymous@public.net",
            role=UserRole.PUBLIC,
            org_name="Public Community",
            subscription_tier=SubscriptionTier.COMMUNITY,
            permissions=sorted(list(ROLE_PERMISSIONS[UserRole.PUBLIC])),
            is_anonymous=True,
        )

    payload = decode_token(credentials.credentials, expected_type="access")
    try:
        role = UserRole(payload.get("role", "public"))
    except ValueError:
        role = UserRole.PUBLIC

    try:
        tier = SubscriptionTier(payload.get("tier", "community"))
    except ValueError:
        tier = ROLE_TIER_MAPPING.get(role, SubscriptionTier.COMMUNITY)

    return UserContext(
        user_id=payload.get("user_id"),
        email=payload.get("sub", "unknown@user"),
        role=role,
        org_name=payload.get("org_name"),
        subscription_tier=tier,
        permissions=payload.get("permissions") or sorted(list(ROLE_PERMISSIONS.get(role, set()))),
        is_anonymous=False,
    )


def get_current_user(user: UserContext = Depends(get_optional_user)) -> UserContext:
    """Requires an authenticated user (rejects anonymous public callers with 401)."""
    if user.is_anonymous:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to access this feature.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(*allowed_roles: UserRole):
    """
    Enforces Role-Based Access Control:
    - Anonymous users get 401.
    - Authenticated users with insufficient roles get 403.
    """
    def role_dependency(user: UserContext = Depends(get_optional_user)) -> UserContext:
        if user.is_anonymous:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please sign in with an authorized account.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if user.role not in allowed_roles:
            role_names = [r.value for r in allowed_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied: this resource requires one of roles {role_names}. "
                    f"Current account role '{user.role.value}' does not have sufficient privilege."
                ),
            )
        return user

    return role_dependency


def require_permission(permission: str):
    """Enforces specific capability check."""
    def perm_dependency(user: UserContext = Depends(get_optional_user)) -> UserContext:
        if not user.has_permission(permission):
            if user.is_anonymous:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Permission '{permission}' requires user authentication.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: account lacks required permission '{permission}'.",
            )
        return user

    return perm_dependency
