"""added passed field in DSAResponse

Revision ID: 2f444e8cf536
Revises: 30e0ddb19c75
Create Date: 2025-05-06 19:39:11.907234

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f444e8cf536'
down_revision: Union[str, None] = '30e0ddb19c75'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('dsa_responses', sa.Column('passed', sa.Boolean(), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('dsa_responses', 'passed')
    # ### end Alembic commands ###
