"""auth rbac base

Revision ID: 20260420_0001
Revises:
Create Date: 2026-04-20 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260420_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("kullanici_adi", sa.String(), nullable=False),
            sa.Column("sifre", sa.String(), nullable=False),
            sa.Column("hashed_password", sa.String(), nullable=True),
            sa.Column("full_name", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        )
        op.create_index("ix_users_id", "users", ["id"], unique=False)
        op.create_index("ix_users_kullanici_adi", "users", ["kullanici_adi"], unique=True)
    else:
        existing_columns = {col["name"] for col in inspector.get_columns("users")}
        with op.batch_alter_table("users") as batch_op:
            if "hashed_password" not in existing_columns:
                batch_op.add_column(sa.Column("hashed_password", sa.String(), nullable=True))
            if "is_active" not in existing_columns:
                batch_op.add_column(sa.Column("is_active", sa.Integer(), nullable=True, server_default="1"))

    if not inspector.has_table("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("actor_role", sa.String(), nullable=True),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("entity_type", sa.String(), nullable=False),
            sa.Column("entity_id", sa.String(), nullable=True),
            sa.Column("payload", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("audit_logs"):
        op.drop_table("audit_logs")

    if inspector.has_table("users"):
        existing_columns = {col["name"] for col in inspector.get_columns("users")}
        with op.batch_alter_table("users") as batch_op:
            if "is_active" in existing_columns:
                batch_op.drop_column("is_active")
            if "hashed_password" in existing_columns:
                batch_op.drop_column("hashed_password")
