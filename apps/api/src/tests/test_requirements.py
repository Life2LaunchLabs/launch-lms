import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine, select

from src.db.organizations import Organization
from src.db.requirements import (
    RequirementAssignmentBatch,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementEnrollmentMigrate,
    RequirementFramework,
    RequirementFrameworkCreate,
    RequirementFrameworkUpdate,
    RequirementFrameworkVersion,
    RequirementNode,
    RequirementNodeInput,
)
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services import requirement_tracking, requirements


NOW = "2026-09-01T12:00:00+00:00"


def _session() -> tuple[Session, PublicUser]:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, User.__table__, Role.__table__, UserOrganization.__table__,
        UserGroup.__table__, UserGroupUser.__table__,
        RequirementFramework.__table__, RequirementFrameworkVersion.__table__, RequirementNode.__table__,
        RequirementAssignmentBatch.__table__,
        RequirementEnrollment.__table__, RequirementAttainmentSource.__table__,
    ])
    db = Session(engine)
    db.add(Organization(id=1, org_uuid="org_1", name="Academy", slug="academy", email="admin@example.com", creation_date=NOW, update_date=NOW))
    db.add_all([
        User(id=1, user_uuid="user_1", username="admin", email="admin@example.com", first_name="Plan", last_name="Admin", is_superadmin=True, creation_date=NOW, update_date=NOW),
        User(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner", creation_date=NOW, update_date=NOW),
        Role(id=1, role_uuid="role_1", name="Admin"), Role(id=4, role_uuid="role_4", name="Member"),
        UserGroup(id=1, org_id=1, usergroup_uuid="group_1", name="Seniors", description="", creation_date=NOW, update_date=NOW),
    ])
    db.commit()
    db.add_all([
        UserOrganization(user_id=1, org_id=1, role_id=1, creation_date=NOW, update_date=NOW),
        UserOrganization(user_id=2, org_id=1, role_id=4, creation_date=NOW, update_date=NOW),
        UserGroupUser(usergroup_id=1, user_id=2, org_id=1, creation_date=NOW, update_date=NOW),
    ])
    db.commit()
    admin = PublicUser(id=1, user_uuid="user_1", username="admin", email="admin@example.com", first_name="Plan", last_name="Admin", is_superadmin=True)
    return db, admin


def _framework(db: Session, admin: PublicUser) -> dict:
    created = requirements.create_framework(db, admin, RequirementFrameworkCreate(
        org_id=1, name="Career readiness", source_metadata={"requirement_levels": [
            {"level_uuid": "level_domain", "name": "Domain", "code_style": "upper_alpha", "metadata_fields": []},
            {"level_uuid": "level_requirement", "name": "Requirement", "code_style": "decimal", "metadata_fields": [{"field_uuid": "field_due", "name": "Review date", "type": "date", "required": False}]},
        ]}, nodes=[
            RequirementNodeInput(node_uuid="node_career", code="manual", title="Career exploration"),
            RequirementNodeInput(node_uuid="node_experience", parent_node_uuid="node_career", code="manual", title="Career experience"),
        ],
    ))
    return requirements.publish_framework(db, admin, 1, created["framework_uuid"])


def test_free_form_framework_edit_and_publish_preserve_supplied_hierarchy():
    db, admin = _session()
    with db:
        source = {"source_url": "https://example.org/standards", "requirement_levels": []}
        nodes = [
            RequirementNodeInput(node_uuid="official-root", code="HS.HECPS", title="Career skills"),
            RequirementNodeInput(node_uuid="official-domain", parent_node_uuid="official-root", code="HS.HECPS.D", title="Workforce"),
            RequirementNodeInput(node_uuid="official-leaf", parent_node_uuid="official-domain", code="HS.HECPS.D.2", title="Resume", metadata={"source_page": 4}),
        ]
        draft = requirements.create_framework(db, admin, RequirementFrameworkCreate(org_id=1, name="Official standards", source_metadata=source, nodes=nodes))
        details = requirements.update_framework(db, admin, 1, draft["framework_uuid"], RequirementFrameworkUpdate(description="Teacher evidence guidance"))
        assert len(details["nodes"]) == 3
        nodes[2].description = "Updated evidence guidance"
        edited = requirements.update_framework(db, admin, 1, draft["framework_uuid"], RequirementFrameworkUpdate(nodes=nodes))
        published = requirements.publish_framework(db, admin, 1, draft["framework_uuid"])
        assert published["status"] == "published"
        # old empty levels are dropped; a framework without them numbers nothing (custom codes) and has no fields
        assert published["source_metadata"] == {"source_url": "https://example.org/standards", "numbering": "custom", "fields": []}
        assert published["nodes"] == edited["nodes"]
        assert [(node["node_uuid"], node["parent_node_uuid"], node["code"]) for node in published["nodes"]] == [(node.node_uuid, node.parent_node_uuid, node.code) for node in nodes]
        assert published["nodes"][2]["metadata"] == {"source_page": 4}


def test_library_framework_copy_uses_published_version_and_is_tenant_owned():
    db, admin = _session()
    with db:
        db.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
        db.commit()
        source = _framework(db, admin)
        requirements.publish_framework_to_library(db, admin, 1, source["framework_uuid"])
        requirements.update_framework(db, admin, 1, source["framework_uuid"], RequirementFrameworkUpdate(nodes=[
            RequirementNodeInput(node_uuid="node_career", title="Changed after library publication"),
        ]))

        assert requirements.list_framework_library(db, admin, 2, "career")[0]["version"] == 1
        copied = requirements.copy_framework_from_library(db, admin, 2, source["framework_uuid"])
        assert copied["org_id"] == 2
        assert copied["source_framework_uuid"] == source["framework_uuid"]
        assert copied["source_version"] == 1
        assert [node["title"] for node in copied["nodes"]] == ["Career exploration", "Career experience"]
        # The copy names its publisher and stays the copying org's to edit.
        listed = requirements.list_frameworks(db, admin, 2)[0]
        assert listed["publisher"] == {"org_id": 1, "name": "Academy", "yours": False} and listed["can_edit"] is True
        assert requirements.list_frameworks(db, admin, 1)[0]["publisher"] == {"org_id": 1, "name": "Academy", "yours": True}
        edited = requirements.update_framework(db, admin, 2, copied["framework_uuid"], RequirementFrameworkUpdate(name="Our career readiness"))
        assert edited["name"] == "Our career readiness" and edited["source_framework_uuid"] == source["framework_uuid"]


def test_staff_read_frameworks_but_only_admins_change_them():
    db, admin = _session()
    with db:
        # A teacher: a custom role that runs goals for the organization, but isn't an admin.
        db.add(Role(id=5, role_uuid="role_teacher", name="Teacher", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
        db.add(User(id=3, user_uuid="user_3", username="teach", email="teach@example.com", first_name="Terry", last_name="Teach", creation_date=NOW, update_date=NOW))
        db.commit()
        db.add(UserOrganization(user_id=3, org_id=1, role_id=5, creation_date=NOW, update_date=NOW))
        db.commit()
        framework = _framework(db, admin)
        staff = PublicUser(id=3, user_uuid="user_3", username="teach", email="teach@example.com", first_name="Terry", last_name="Teach")
        learner = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")

        listed = requirements.list_frameworks(db, staff, 1)
        assert [item["framework_uuid"] for item in listed] == [framework["framework_uuid"]] and listed[0]["can_edit"] is False
        read = requirements.get_framework(db, staff, 1, framework["framework_uuid"])
        assert read["name"] == "Career readiness" and read["can_edit"] is False and len(read["nodes"]) == 2
        assert requirements.get_framework(db, admin, 1, framework["framework_uuid"])["can_edit"] is True

        for attempt in (
            lambda: requirements.update_framework(db, staff, 1, framework["framework_uuid"], RequirementFrameworkUpdate(name="Changed")),
            lambda: requirements.publish_framework(db, staff, 1, framework["framework_uuid"]),
            lambda: requirements.create_framework(db, staff, RequirementFrameworkCreate(org_id=1, name="New")),
            lambda: requirements.set_flags(db, learner, 1, framework["framework_uuid"], []),
            lambda: requirements.list_frameworks(db, learner, 1),
            lambda: requirements.get_framework(db, learner, 1, framework["framework_uuid"]),
        ):
            with pytest.raises(HTTPException) as denied:
                attempt()
            assert denied.value.status_code == 403


def test_library_framework_shared_as_is_is_a_locked_published_copy():
    db, admin = _session()
    with db:
        db.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
        db.commit()
        source = _framework(db, admin)
        requirements.publish_framework_to_library(db, admin, 1, source["framework_uuid"], editable=False)
        assert requirements.list_framework_library(db, admin, 2)[0]["editable"] is False
        copied = requirements.copy_framework_from_library(db, admin, 2, source["framework_uuid"])
        assert (copied["locked"], copied["status"], copied["published_version"]) == (True, "published", 1)
        assert requirements.list_frameworks(db, admin, 2)[0]["can_edit"] is False
        for change in (
            lambda: requirements.update_framework(db, admin, 2, copied["framework_uuid"], RequirementFrameworkUpdate(name="Ours now")),
            lambda: requirements.publish_framework(db, admin, 2, copied["framework_uuid"]),
        ):
            with pytest.raises(HTTPException) as exc:
                change()
            assert exc.value.status_code == 409


def test_categories_number_children_and_check_rules():
    db, admin = _session()
    with db:
        created = requirements.create_framework(db, admin, RequirementFrameworkCreate(org_id=1, name="Graduation", nodes=[
            RequirementNodeInput(node_uuid="sb3", code="SB3", title="SB3", numbering="decimal"),
            RequirementNodeInput(node_uuid="sb3h", parent_node_uuid="sb3", title="Higher education", numbering="lower_alpha"),
            RequirementNodeInput(node_uuid="sb3h1", parent_node_uuid="sb3h", title="Explore"),
            RequirementNodeInput(node_uuid="ccl", code="CCL", title="CCL", rule={"kind": "any", "count": 1}),
            RequirementNodeInput(node_uuid="ccl1", parent_node_uuid="ccl", code="CCL-AW", title="Awareness", rule={"kind": "any", "count": 1}),
        ]))
        nodes = {node["node_uuid"]: node for node in created["nodes"]}
        assert [nodes[key]["code"] for key in ("sb3", "sb3h", "sb3h1", "ccl", "ccl1")] == ["SB3", "SB3.1", "SB3.1.a", "CCL", "CCL-AW"]
        assert nodes["ccl"]["rule"] == {"kind": "any", "count": 1}
        assert nodes["ccl1"]["rule"] == {"kind": "all"}  # a requirement has no rule
        with pytest.raises(HTTPException) as exc:
            requirements.update_framework(db, admin, 1, created["framework_uuid"], RequirementFrameworkUpdate(nodes=[
                RequirementNodeInput(node_uuid="ccl", code="CCL", title="CCL", rule={"kind": "any", "count": 2}),
                RequirementNodeInput(node_uuid="ccl1", parent_node_uuid="ccl", code="CCL-AW", title="Awareness"),
            ]))
        assert exc.value.status_code == 422


def test_migration_turns_levels_into_numbering_and_fields():
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    path = Path(__file__).parents[2] / "migrations" / "versions" / "e2c8a4f6b1d3_requirement_categories.py"
    spec = importlib.util.spec_from_file_location("requirement_categories", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    db, admin = _session()
    with db:
        framework = _framework(db, admin)  # made with levels: Domain (upper_alpha), Requirement (decimal, a Due field)
        row = db.exec(select(RequirementFramework)).one()
        row.source_metadata = {"source_url": "x", "requirement_levels": [
            {"level_uuid": "level_domain", "name": "Domain", "code_style": "upper_alpha", "metadata_fields": []},
            {"level_uuid": "level_requirement", "name": "Requirement", "code_style": "decimal", "metadata_fields": [{"field_uuid": "field_due", "name": "Due", "type": "date", "required": True}]},
        ]}
        db.add(row)
        for node in db.exec(select(RequirementNode)).all():
            node.metadata_json = {}
            db.add(node)
        db.commit()
        connection = db.connection()
        for column in ("flagged_node_uuids", "locked", "library_editable"):
            connection.execute(text(f"ALTER TABLE requirementframework DROP COLUMN {column}"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        db.commit()
        db.expire_all()
        upgraded = requirements.get_framework(db, admin, 1, framework["framework_uuid"])
        assert upgraded["source_metadata"]["numbering"] == "upper_alpha"
        assert "requirement_levels" not in upgraded["source_metadata"]
        assert upgraded["source_metadata"]["fields"] == [{"field_uuid": "field_due", "name": "Due", "type": "date", "required": True, "applies": "requirements"}]
        assert [(node["code"], node["numbering"]) for node in upgraded["nodes"]] == [("A", "decimal"), ("A.1", "custom")]
        assert (upgraded["locked"], upgraded["library_editable"], upgraded["flagged_node_uuids"]) == (False, True, [])


def test_non_owner_org_cannot_publish_requirement_to_library():
    db, admin = _session()
    with db:
        db.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
        db.commit()
        created = requirements.create_framework(db, admin, RequirementFrameworkCreate(org_id=2, name="Private", nodes=[RequirementNodeInput(title="One")]))
        requirements.publish_framework(db, admin, 2, created["framework_uuid"])
        with pytest.raises(HTTPException) as exc:
            requirements.publish_framework_to_library(db, admin, 2, created["framework_uuid"])
        assert exc.value.status_code == 403


def _framework_id(db: Session, framework: dict) -> int:
    return int(db.exec(select(RequirementFramework.id).where(RequirementFramework.framework_uuid == framework["framework_uuid"])).one())


def test_tracking_a_learner_snapshots_leaf_requirements_once():
    db, admin = _session()
    with db:
        framework = _framework(db, admin)
        requirement_tracking.track(db, 1, 2, {_framework_id(db, framework)})
        requirement_tracking.track(db, 1, 2, {_framework_id(db, framework)})  # a second plan that counts adds nothing
        enrollment = db.exec(select(RequirementEnrollment)).one()
        batch = db.get(RequirementAssignmentBatch, enrollment.batch_id)
        assert (batch.usergroup_id, batch.user_id, batch.created_by_user_id) == (None, None, None)
        assert enrollment.framework_snapshot["leaf_node_uuids"] == ["node_experience"]
        # the old levels became numbering: categories by letter, their requirements by number
        assert enrollment.framework_snapshot["source_metadata"]["numbering"] == "upper_alpha"
        assert enrollment.framework_snapshot["nodes"][0]["numbering"] == "decimal"
        assert [field["field_uuid"] for field in enrollment.framework_snapshot["source_metadata"]["fields"]] == ["field_due"]
        assert [node["code"] for node in enrollment.framework_snapshot["nodes"]] == ["A", "A.1"]
        report = requirements.report(db, admin, 1, framework["framework_uuid"])
        assert report["learner_count"] == 1
        assert report["rows"][0]["total"] == 1
        assert report["rows"][0]["status"] == "active"


def test_verified_completion_satisfies_requirement_and_protects_completed_version():
    db, admin = _session()
    with db:
        framework = _framework(db, admin)
        requirement_tracking.track(db, 1, 2, {_framework_id(db, framework)})
        enrollment = db.exec(select(RequirementEnrollment)).one()
        db.add(RequirementAttainmentSource(
            source_uuid="requirement_source_1", enrollment_id=enrollment.id, node_uuid="node_experience", objective_title="Complete an internship",
            verified_by_user_id=1, creation_date=NOW, update_date=NOW,
        ))
        db.flush()
        requirement_tracking._recompute_enrollment(db, enrollment)
        db.commit()

        report = requirements.report(db, admin, 1, framework["framework_uuid"])
        assert report["completed_count"] == 1
        assert report["rows"][0]["sources"][0]["objective_title"] == "Complete an internship"

        requirements.update_framework(db, admin, 1, framework["framework_uuid"], RequirementFrameworkUpdate(nodes=[
            RequirementNodeInput(node_uuid="node_career", code="B", title="Career exploration"),
            RequirementNodeInput(node_uuid="node_experience", parent_node_uuid="node_career", code="B.3", title="Career experience"),
            RequirementNodeInput(node_uuid="node_reflection", parent_node_uuid="node_career", code="B.4", title="Reflection"),
        ]))
        published = requirements.publish_framework(db, admin, 1, framework["framework_uuid"])
        assert published["version"] == 2
        migrated = requirement_tracking.migrate_enrollments(db, admin, 1, framework["framework_uuid"], RequirementEnrollmentMigrate())
        assert migrated["updated"] == 0
        enrollment = db.exec(select(RequirementEnrollment)).one()
        assert enrollment.framework_snapshot["version"] == 1


def test_level_code_styles_generate_hierarchical_codes_and_preserve_published_versions():
    db, admin = _session()
    with db:
        created = requirements.create_framework(db, admin, RequirementFrameworkCreate(
            org_id=1,
            name="Graduation requirements",
            source_metadata={"requirement_levels": [
                {"level_uuid": "domain", "name": "Domain", "code_style": "upper_alpha", "metadata_fields": []},
                {"level_uuid": "strand", "name": "Strand", "code_style": "decimal", "metadata_fields": []},
                {"level_uuid": "requirement", "name": "Requirement", "code_style": "lower_roman", "metadata_fields": []},
            ]},
            nodes=[
                RequirementNodeInput(node_uuid="root_one", code="ignored", title="First domain", position=0),
                RequirementNodeInput(node_uuid="child_one", parent_node_uuid="root_one", code="ignored", title="First strand", position=0),
                RequirementNodeInput(node_uuid="leaf_one", parent_node_uuid="child_one", code="ignored", title="First requirement", position=0),
                RequirementNodeInput(node_uuid="leaf_two", parent_node_uuid="child_one", code="ignored", title="Second requirement", position=1),
                RequirementNodeInput(node_uuid="root_two", code="ignored", title="Second domain", position=1),
            ],
        ))
        assert {node["node_uuid"]: node["code"] for node in created["nodes"]} == {
            "root_one": "A",
            "child_one": "A.1",
            "leaf_one": "A.1.i",
            "leaf_two": "A.1.ii",
            "root_two": "B",
        }
        published = requirements.publish_framework(db, admin, 1, created["framework_uuid"])
        updated = requirements.update_framework(db, admin, 1, created["framework_uuid"], RequirementFrameworkUpdate(
            source_metadata={"requirement_levels": [
                {"level_uuid": "domain", "name": "Domain", "code_style": "lower_alpha", "metadata_fields": []},
                {"level_uuid": "strand", "name": "Strand", "code_style": "upper_roman", "metadata_fields": []},
                {"level_uuid": "requirement", "name": "Requirement", "code_style": "decimal", "metadata_fields": []},
            ]},
        ))
        assert published["version"] == 1
        assert updated["version"] == 2
        assert {node["node_uuid"]: node["code"] for node in updated["nodes"]}["leaf_two"] == "a.I.2"
        original = requirements.get_framework(db, admin, 1, created["framework_uuid"], version=1)
        assert {node["node_uuid"]: node["code"] for node in original["nodes"]}["leaf_two"] == "A.1.ii"


def test_flags_mark_requirements_of_the_current_version():
    db, admin = _session()
    with db:
        framework = _framework(db, admin)
        flagged = requirements.set_flags(db, admin, 1, framework["framework_uuid"], ["node_experience", "node_experience"])
        assert flagged["flagged_node_uuids"] == ["node_experience"]
        with pytest.raises(HTTPException) as exc:
            requirements.set_flags(db, admin, 1, framework["framework_uuid"], ["node_career"])  # a category, not a requirement
        assert exc.value.status_code == 422
        assert requirements.set_flags(db, admin, 1, framework["framework_uuid"], [])["flagged_node_uuids"] == []
