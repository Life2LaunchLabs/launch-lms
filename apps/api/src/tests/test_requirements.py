from sqlmodel import SQLModel, Session, create_engine, select

from src.db.organizations import Organization
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress
from src.db.programs import Objective, ObjectiveProgress, ObjectiveProgressStatus, Program, ProgramObjective, ProgramPhase
from src.db.requirements import (
    ProgramObjectiveRequirement,
    RequirementAssignmentBatch,
    RequirementAssignmentCreate,
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
from src.services import requirements


NOW = "2026-09-01T12:00:00+00:00"


def _session() -> tuple[Session, PublicUser]:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, User.__table__, Role.__table__, UserOrganization.__table__,
        UserGroup.__table__, UserGroupUser.__table__, Program.__table__, ProgramPhase.__table__,
        Objective.__table__, ProgramObjective.__table__, ObjectiveProgress.__table__,
        Plan.__table__, PlanObjective.__table__, PlanObjectiveProgress.__table__,
        RequirementFramework.__table__, RequirementFrameworkVersion.__table__, RequirementNode.__table__,
        ProgramObjectiveRequirement.__table__, RequirementAssignmentBatch.__table__,
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


def test_framework_assignment_snapshots_leaf_requirements_and_syncs_group_membership():
    db, admin = _session()
    with db:
        framework = _framework(db, admin)
        assigned = requirements.assign_framework(db, admin, 1, framework["framework_uuid"], RequirementAssignmentCreate(usergroup_id=1))
        assert assigned["enrollment_count"] == 1
        enrollment = db.exec(select(RequirementEnrollment)).one()
        assert enrollment.framework_snapshot["leaf_node_uuids"] == ["node_experience"]
        assert enrollment.framework_snapshot["source_metadata"]["requirement_levels"][1]["name"] == "Requirement"
        assert enrollment.framework_snapshot["source_metadata"]["requirement_levels"][1]["code_style"] == "decimal"
        assert [node["code"] for node in enrollment.framework_snapshot["nodes"]] == ["A", "A.1"]
        report = requirements.report(db, admin, 1, framework["framework_uuid"])
        assert report["learner_count"] == 1
        assert report["rows"][0]["total"] == 1
        assert report["rows"][0]["status"] == "active"


def test_verified_mapped_objective_satisfies_requirement_and_protects_completed_version():
    db, admin = _session()
    with db:
        framework = _framework(db, admin)
        requirements.assign_framework(db, admin, 1, framework["framework_uuid"], RequirementAssignmentCreate(user_id=2))
        program = Program(program_uuid="program_1", slug="program-1", org_id=1, name="Launch plan", creation_date=NOW, update_date=NOW)
        objective = Objective(objective_uuid="objective_1", org_id=1, title="Complete an internship", creation_date=NOW, update_date=NOW)
        db.add_all([program, objective])
        db.flush()
        relation = ProgramObjective(program_id=program.id, objective_id=objective.id, creation_date=NOW, update_date=NOW)
        db.add(relation)
        db.flush()
        requirements.update_mappings(db, admin, 1, relation, ["node_experience"])
        progress = ObjectiveProgress(
            progress_uuid="progress_1", org_id=1, objective_id=objective.id, user_id=2,
            status=ObjectiveProgressStatus.COMPLETED, completed_by_user_id=1,
            creation_date=NOW, update_date=NOW,
        )
        db.add(progress)
        db.flush()
        requirements.sync_legacy_progress(db, progress, objective)
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
        migrated = requirements.migrate_enrollments(db, admin, 1, framework["framework_uuid"], RequirementEnrollmentMigrate())
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
