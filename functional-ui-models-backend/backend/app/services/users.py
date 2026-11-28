"""User repository service for database-backed authentication and RBAC."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import session_scope

UTC = timezone.utc


def get_user_by_email(email: str, session: Session | None = None) -> User | None:
    """Retrieves a user by normalized lowercase email address."""
    clean_email = email.strip().lower()
    if session is not None:
        stmt = select(User).where(User.email == clean_email)
        return session.scalar(stmt)

    with session_scope() as s:
        stmt = select(User).where(User.email == clean_email)
        user = s.scalar(stmt)
        if user is not None:
            s.expunge(user)
        return user


def get_user_by_id(user_id: uuid.UUID | str, session: Session | None = None) -> User | None:
    """Retrieves a user by primary key ID."""
    uid = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
    if session is not None:
        return session.get(User, uid)

    with session_scope() as s:
        user = s.get(User, uid)
        if user is not None:
            s.expunge(user)
        return user


def create_user(
    email: str,
    password_hash: str,
    password_salt: str,
    role: str = "public",
    org_name: str | None = None,
    subscription_tier: str = "community",
    is_active: bool = True,
    session: Session | None = None,
) -> User:
    """Persists a new user record in the database."""
    clean_email = email.strip().lower()
    now = datetime.now(UTC)
    new_user = User(
        id=uuid.uuid4(),
        email=clean_email,
        password_hash=password_hash,
        password_salt=password_salt,
        role=role,
        org_name=org_name,
        subscription_tier=subscription_tier,
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )
    if session is not None:
        session.add(new_user)
        session.flush()
        return new_user

    with session_scope() as s:
        s.add(new_user)
        s.flush()
        s.expunge(new_user)
        return new_user


def update_user_role(
    email: str,
    role: str,
    org_name: str | None = None,
    subscription_tier: str | None = None,
    session: Session | None = None,
) -> User | None:
    """Updates the assigned role, org name, and tier of an existing user."""
    clean_email = email.strip().lower()
    if session is not None:
        stmt = select(User).where(User.email == clean_email)
        user = session.scalar(stmt)
        if user is not None:
            user.role = role
            if org_name is not None:
                user.org_name = org_name
            if subscription_tier is not None:
                user.subscription_tier = subscription_tier
            user.updated_at = datetime.now(UTC)
        return user

    with session_scope() as s:
        stmt = select(User).where(User.email == clean_email)
        user = s.scalar(stmt)
        if user is not None:
            user.role = role
            if org_name is not None:
                user.org_name = org_name
            if subscription_tier is not None:
                user.subscription_tier = subscription_tier
            user.updated_at = datetime.now(UTC)
            s.flush()
            s.expunge(user)
        return user


def update_user_password(
    email: str,
    password_hash: str,
    password_salt: str,
    session: Session | None = None,
) -> User | None:
    """Updates password hash and salt for a user."""
    clean_email = email.strip().lower()
    if session is not None:
        stmt = select(User).where(User.email == clean_email)
        user = session.scalar(stmt)
        if user is not None:
            user.password_hash = password_hash
            user.password_salt = password_salt
            user.updated_at = datetime.now(UTC)
        return user

    with session_scope() as s:
        stmt = select(User).where(User.email == clean_email)
        user = s.scalar(stmt)
        if user is not None:
            user.password_hash = password_hash
            user.password_salt = password_salt
            user.updated_at = datetime.now(UTC)
            s.flush()
            s.expunge(user)
        return user
