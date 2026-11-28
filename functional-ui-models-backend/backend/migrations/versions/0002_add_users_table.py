"""Add users table for persistent authentication and RBAC.

Revision ID: 0002_add_users_table
Revises: 0001_initial
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_add_users_table"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("password_salt", sa.String(64), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="public"),
        sa.Column("org_name", sa.String(255), nullable=True),
        sa.Column("subscription_tier", sa.String(32), nullable=False, server_default="community"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_created_at", "users", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
