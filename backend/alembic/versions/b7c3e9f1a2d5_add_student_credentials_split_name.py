"""add student credentials and split name

Revision ID: b7c3e9f1a2d5
Revises: f5e843745c1d
Create Date: 2026-09-02 07:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b7c3e9f1a2d5'
down_revision: Union[str, None] = 'a9c1d2e3f4b5'

branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add first_name and last_name columns ──────────────────────────────
    op.add_column('users', sa.Column('first_name', sa.String(length=150), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(length=150), nullable=True))

    # ── 2. Migrate data: split existing name column into first_name / last_name
    op.execute("""
        UPDATE users
        SET
            first_name = CASE
                WHEN TRIM(name) = '' THEN ''
                ELSE SPLIT_PART(TRIM(name), ' ', 1)
            END,
            last_name = CASE
                WHEN TRIM(name) = '' OR POSITION(' ' IN TRIM(name)) = 0 THEN ''
                ELSE TRIM(SUBSTRING(TRIM(name) FROM POSITION(' ' IN TRIM(name)) + 1))
            END
    """)

    # ── 3. Set NOT NULL after population ─────────────────────────────────────
    op.alter_column('users', 'first_name', nullable=False, server_default='')
    op.alter_column('users', 'last_name', nullable=False, server_default='')

    # ── 4. Drop the old name column ──────────────────────────────────────────
    op.drop_column('users', 'name')

    # ── 5. Drop old global unique constraints on phone and email ─────────────
    # Drop old unique index on phone (was created as ix_users_phone)
    op.drop_index(op.f('ix_users_phone'), table_name='users')
    # Drop old unique constraint on email
    op.drop_constraint('users_email_key', 'users', type_='unique')

    # ── 6. Create partial unique indexes (only enforce uniqueness for non-students)
    op.execute("""
        CREATE UNIQUE INDEX ix_users_phone_nonadmin
        ON users (phone)
        WHERE role IN ('org_admin', 'super_admin')
    """)
    op.execute("""
        CREATE UNIQUE INDEX ix_users_email_nonadmin
        ON users (email)
        WHERE role IN ('org_admin', 'super_admin') AND email IS NOT NULL
    """)

    # ── 7. Keep a non-unique index on phone for fast lookups ─────────────────
    op.create_index('ix_users_phone', 'users', ['phone'], unique=False)

    # ── 8. Create student_credentials table ──────────────────────────────────
    op.create_table(
        'student_credentials',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('username', sa.String(length=100), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_student_credentials_user_id', 'student_credentials', ['user_id'], unique=True)
    op.create_index('ix_student_credentials_username', 'student_credentials', ['username'], unique=True)


def downgrade() -> None:
    # Reverse order
    op.drop_index('ix_student_credentials_username', table_name='student_credentials')
    op.drop_index('ix_student_credentials_user_id', table_name='student_credentials')
    op.drop_table('student_credentials')

    op.drop_index('ix_users_phone', table_name='users')
    op.execute("DROP INDEX IF EXISTS ix_users_email_nonadmin")
    op.execute("DROP INDEX IF EXISTS ix_users_phone_nonadmin")

    # Restore global unique index on phone
    op.create_index(op.f('ix_users_phone'), 'users', ['phone'], unique=True)
    # Restore global unique constraint on email
    op.create_unique_constraint('users_email_key', 'users', ['email'])

    # Restore name column
    op.add_column('users', sa.Column('name', sa.String(length=255), nullable=True))
    op.execute("""
        UPDATE users
        SET name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    """)
    op.alter_column('users', 'name', nullable=False, server_default='')

    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
