"""add system controls table

Revision ID: 20260423_0003
Revises: 20260422_0002
Create Date: 2026-04-23 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260423_0003"
down_revision = "20260422_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("system_controls"):
        op.create_table(
            "system_controls",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("key", sa.String(), nullable=False),
            sa.Column("value", sa.String(), nullable=False),
            sa.Column("updated_at", sa.String(), nullable=False),
            sa.Column("updated_by", sa.String(), nullable=True),
            sa.UniqueConstraint("key", name="uq_system_controls_key"),
        )
        op.create_index("ix_system_controls_key", "system_controls", ["key"], unique=True)

    maintenance_row = bind.execute(
        sa.text("SELECT id FROM system_controls WHERE key = 'maintenance_mode' LIMIT 1")
    ).fetchone()
    if not maintenance_row:
        bind.execute(
            sa.text(
                """
                INSERT INTO system_controls(key, value, updated_at, updated_by)
                VALUES ('maintenance_mode', 'off', :updated_at, 'system')
                """
            ),
            {"updated_at": "23.04.2026 00:00"},
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("system_controls"):
        op.drop_index("ix_system_controls_key", table_name="system_controls")
        op.drop_table("system_controls")
