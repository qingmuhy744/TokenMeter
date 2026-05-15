"""add indexes for results and plans

Revision ID: 9b9d8c7e6f5a
Revises: 2f9c1045e7d7
Create Date: 2026-05-11 23:50:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "9b9d8c7e6f5a"
down_revision: Union[str, Sequence[str], None] = "2f9c1045e7d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        "ix_test_results_plan_created_at",
        "test_results",
        ["plan_id", "created_at"],
    )
    op.create_index("ix_test_results_created_at", "test_results", ["created_at"])
    op.create_index("ix_token_plans_parent_id", "token_plans", ["parent_id"])
    op.create_index("ix_token_plans_is_active", "token_plans", ["is_active"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_token_plans_is_active", table_name="token_plans")
    op.drop_index("ix_token_plans_parent_id", table_name="token_plans")
    op.drop_index("ix_test_results_created_at", table_name="test_results")
    op.drop_index("ix_test_results_plan_created_at", table_name="test_results")
