"""app policy and snapshots

Revision ID: 20260422_0002
Revises: 20260420_0001
Create Date: 2026-04-22 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260422_0002"
down_revision = "20260420_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("min_supported_version", sa.String(), nullable=False, server_default="0.0.0"),
        sa.Column("latest_version", sa.String(), nullable=False, server_default="1.0.0"),
        sa.Column("force_update", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("maintenance_mode", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("feature_flags", sa.String(), nullable=False, server_default="{}"),
        sa.Column("announcement", sa.String(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.UniqueConstraint("platform", name="uq_app_policies_platform"),
    )
    op.create_index("ix_app_policies_platform", "app_policies", ["platform"])

    op.create_table(
        "app_policy_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("min_supported_version", sa.String(), nullable=False),
        sa.Column("latest_version", sa.String(), nullable=False),
        sa.Column("force_update", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("maintenance_mode", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("feature_flags", sa.String(), nullable=False, server_default="{}"),
        sa.Column("announcement", sa.String(), nullable=True),
        sa.Column("changed_at", sa.String(), nullable=False),
        sa.Column("changed_by", sa.String(), nullable=True),
    )
    op.create_index("ix_app_policy_snapshots_platform", "app_policy_snapshots", ["platform"])


def downgrade() -> None:
    op.drop_index("ix_app_policy_snapshots_platform", table_name="app_policy_snapshots")
    op.drop_table("app_policy_snapshots")
    op.drop_index("ix_app_policies_platform", table_name="app_policies")
    op.drop_table("app_policies")
