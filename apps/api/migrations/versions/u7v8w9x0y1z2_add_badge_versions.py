"""add immutable badge versions

Revision ID: u7v8w9x0y1z2
Revises: t6u7v8w9x0y1
"""

from alembic import op
import json
import sqlalchemy as sa

revision = "u7v8w9x0y1z2"
down_revision = "t6u7v8w9x0y1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learningbadgeversion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version_uuid", sa.String(), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("state", sa.String(), nullable=False, server_default="draft"),
        sa.Column("semantic_version", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False, server_default="Untitled draft"),
        sa.Column("description", sa.String(), nullable=True, server_default=""),
        sa.Column("based_on_version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="SET NULL"), nullable=True),
        sa.Column("definition", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("published_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("version_uuid"),
        sa.UniqueConstraint("badge_id", "semantic_version"),
    )
    op.create_index("ix_learningbadgeversion_badge_id", "learningbadgeversion", ["badge_id"])
    op.create_index("ix_learningbadgeversion_org_id", "learningbadgeversion", ["org_id"])
    op.create_index("ix_learningbadgeversion_state", "learningbadgeversion", ["state"])
    op.create_index("ix_learningbadgeversion_based_on_version_id", "learningbadgeversion", ["based_on_version_id"])
    for name, column in (
        ("learningbadge", sa.Column("active_version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="SET NULL"), nullable=True)),
        ("learningpath", sa.Column("version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True)),
        ("learningactivity", sa.Column("version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True)),
        ("learningpage", sa.Column("version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True)),
        ("learningrun", sa.Column("badge_version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="RESTRICT"), nullable=True)),
        ("learningbadgeaward", sa.Column("badge_version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="RESTRICT"), nullable=True)),
        ("learningbadgeaward", sa.Column("major_version", sa.Integer(), nullable=False, server_default="1")),
    ):
        op.add_column(name, column)
    for table, column in (("learningbadge", "active_version_id"), ("learningpath", "version_id"), ("learningactivity", "version_id"), ("learningpage", "version_id"), ("learningrun", "badge_version_id"), ("learningbadgeaward", "badge_version_id")):
        op.create_index(f"ix_{table}_{column}", table, [column])

    inspector = sa.inspect(op.get_bind())
    for constraint in inspector.get_unique_constraints("learningpath"):
        if constraint.get("column_names") == ["badge_id"]:
            op.drop_constraint(constraint["name"], "learningpath", type_="unique")
    for constraint in inspector.get_unique_constraints("learningbadgeaward"):
        if constraint.get("column_names") == ["badge_id", "user_id"]:
            op.drop_constraint(constraint["name"], "learningbadgeaward", type_="unique")
    op.create_unique_constraint("uq_learningpath_badge_version", "learningpath", ["badge_id", "version_id"])
    op.create_unique_constraint("uq_learningbadgeaward_badge_user_major", "learningbadgeaward", ["badge_id", "user_id", "major_version"])

    connection = op.get_bind()
    badges = connection.execute(sa.text("SELECT id, org_id, badge_uuid, name, description, about, criteria, thumbnail_image, public, status, protected, system_type, direct_conferral_enabled, marketplace_listed, metadata, creation_date, update_date FROM learningbadge")).mappings().all()
    for badge in badges:
        version_uuid = f"badge_version_legacy_{badge['badge_uuid']}"
        published = badge["status"] in ("published", "coming_soon")
        definition = {
            "name": badge["name"], "description": badge["description"] or "", "about": badge["about"] or "",
            "criteria": badge["criteria"] or "", "thumbnail_image": badge["thumbnail_image"] or "",
            "protected": bool(badge["protected"]), "system_type": badge["system_type"],
            "direct_conferral_enabled": bool(badge["direct_conferral_enabled"]),
            "badge_metadata": badge["metadata"] or {},
        }
        result = connection.execute(sa.text("INSERT INTO learningbadgeversion (version_uuid, badge_id, org_id, state, semantic_version, title, description, definition, revision, published_at, creation_date, update_date) VALUES (:uuid, :badge_id, :org_id, :state, :semver, :title, '', :definition, 1, :published_at, :created, :updated) RETURNING id"), {
            "uuid": version_uuid, "badge_id": badge["id"], "org_id": badge["org_id"], "state": "published" if published else "draft",
            "semver": "1.0.0" if published else None, "title": "Initial Version",
            "definition": json.dumps(definition), "published_at": None,
            "created": badge["creation_date"], "updated": badge["update_date"],
        })
        version_id = result.scalar_one()
        connection.execute(sa.text("UPDATE learningpath SET version_id=:version_id WHERE badge_id=:badge_id"), {"version_id": version_id, "badge_id": badge["id"]})
        connection.execute(sa.text("UPDATE learningactivity SET version_id=:version_id WHERE badge_id=:badge_id"), {"version_id": version_id, "badge_id": badge["id"]})
        connection.execute(sa.text("UPDATE learningpage SET version_id=:version_id WHERE badge_id=:badge_id"), {"version_id": version_id, "badge_id": badge["id"]})
        connection.execute(sa.text("UPDATE learningrun SET badge_version_id=:version_id WHERE badge_id=:badge_id"), {"version_id": version_id, "badge_id": badge["id"]})
        connection.execute(sa.text("UPDATE learningbadgeaward SET badge_version_id=:version_id WHERE badge_id=:badge_id"), {"version_id": version_id, "badge_id": badge["id"]})
        if published:
            connection.execute(sa.text("UPDATE learningbadge SET active_version_id=:version_id WHERE id=:badge_id"), {"version_id": version_id, "badge_id": badge["id"]})


def downgrade() -> None:
    op.drop_constraint("uq_learningbadgeaward_badge_user_major", "learningbadgeaward", type_="unique")
    op.create_unique_constraint("uq_learningbadgeaward_badge_user", "learningbadgeaward", ["badge_id", "user_id"])
    op.drop_constraint("uq_learningpath_badge_version", "learningpath", type_="unique")
    op.create_unique_constraint("uq_learningpath_badge", "learningpath", ["badge_id"])
    for table, column in (("learningbadgeaward", "badge_version_id"), ("learningrun", "badge_version_id"), ("learningpage", "version_id"), ("learningactivity", "version_id"), ("learningpath", "version_id"), ("learningbadge", "active_version_id")):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
    op.drop_column("learningbadgeaward", "major_version")
    op.drop_column("learningbadgeaward", "badge_version_id")
    op.drop_column("learningrun", "badge_version_id")
    op.drop_column("learningpage", "version_id")
    op.drop_column("learningactivity", "version_id")
    op.drop_column("learningpath", "version_id")
    op.drop_column("learningbadge", "active_version_id")
    op.drop_index("ix_learningbadgeversion_based_on_version_id", table_name="learningbadgeversion")
    op.drop_index("ix_learningbadgeversion_state", table_name="learningbadgeversion")
    op.drop_index("ix_learningbadgeversion_org_id", table_name="learningbadgeversion")
    op.drop_index("ix_learningbadgeversion_badge_id", table_name="learningbadgeversion")
    op.drop_table("learningbadgeversion")
