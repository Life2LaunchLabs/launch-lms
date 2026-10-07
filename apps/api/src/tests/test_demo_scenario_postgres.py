"""PostgreSQL scenario export checks against a disposable synthetic database."""

import os
import pytest
from sqlalchemy import create_engine
from sqlmodel import Session
from src.db.users import User
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization


@pytest.mark.skipif(
    not os.environ.get("DEMO_TEST_DATABASE_URL"),
    reason="Requires disposable PostgreSQL database",
)
def test_full_cohort_capture_preserves_stages_and_drops_real_attribution():
    url = os.environ["DEMO_TEST_DATABASE_URL"]
    assert "test" in url.rsplit("/", 1)[-1]
    from src.core.events.database import import_all_models
    from src.db.programs import (
        Program,
        Objective,
        ProgramObjective,
        ProgramAssignment,
        ProgramParticipant,
        ObjectiveProgress,
    )
    from src.services.demo.checkpoints import capture
    from src.db.planning import Plan, PlanRole, PlanInvitation
    from src.db.resources import Resource
    from src.db.usergroups import UserGroup
    from src.db.usergroup_resources import UserGroupResource
    from src.db.resource_authors import ResourceAuthor
    from src.db.learning import BadgeIssuerAuthorization

    import_all_models()
    engine = create_engine(url)
    try:
        with Session(engine) as db:
            org_id = 90002
            identifiers = set(range(90200, 90220))
            db.add(
                Organization(
                    id=org_id,
                    org_uuid="org_cohort_test",
                    slug="cohort-test",
                    name="Fictional cohort",
                    email="fake@example.com",
                )
            )
            for identifier in identifiers:
                db.add(
                    User(
                        id=identifier,
                        user_uuid=f"user_cohort_test_{identifier}",
                        username=f"fake{identifier}",
                        email=f"fake{identifier}@example.com",
                        first_name=f"Stage {identifier}",
                        last_name="Demo",
                    )
                )
            db.flush()
            db.add(
                Plan(
                    id=90002,
                    plan_uuid="plan_cohort_test",
                    slug="cohort-test",
                    name="Prepared plan",
                    subject_user_id=90201,
                    owner_user_id=90200,
                    source_org_id=org_id,
                )
            )
            db.add(
                Resource(
                    id=90002,
                    resource_uuid="resource_cohort_test",
                    org_id=1,
                    title="Live shared catalog resource",
                    external_url="https://example.com/resource",
                    created_by_user_id=1,
                )
            )
            db.add(
                UserGroup(
                    id=90002,
                    usergroup_uuid="group_cohort_test",
                    org_id=org_id,
                    name="Prepared cohort",
                    description="Fictional learners",
                )
            )
            db.flush()
            db.add(
                PlanRole(
                    id=90002,
                    role_uuid="role_cohort_test",
                    plan_id=90002,
                    key="subject",
                    name="Learner",
                    capabilities=["view_plan"],
                )
            )
            db.add(
                UserGroupResource(
                    usergroup_id=90002,
                    resource_uuid="resource_cohort_test",
                    org_id=org_id,
                )
            )
            db.add(
                ResourceAuthor(
                    resource_uuid="resource_cohort_test",
                    user_id=90200,
                    authorship="CREATOR",
                    authorship_status="ACTIVE",
                )
            )
            db.add(
                BadgeIssuerAuthorization(
                    authorization_uuid="issuer_cohort_test",
                    badge_id=1,
                    creator_org_id=1,
                    issuer_org_id=org_id,
                    status="approved",
                    open_to_all=True,
                    decided_by_user_id=1,
                )
            )
            db.flush()
            for identifier, email in [
                (90002, "fake90201@example.com"),
                (90003, db.get(User, 1).email),
            ]:
                db.add(
                    PlanInvitation(
                        id=identifier,
                        invitation_uuid=f"invitation_cohort_test_{identifier}",
                        plan_id=90002,
                        kind="subject",
                        email=email,
                        email_normalized=email.lower(),
                        role_id=90002,
                        invited_by_user_id=90200,
                    )
                )
            for identifier in identifiers:
                db.add(
                    UserOrganization(
                        user_id=identifier,
                        org_id=org_id,
                        role_id=1 if identifier == 90200 else 4,
                        creation_date="",
                        update_date="",
                    )
                )
            db.add(
                Program(
                    id=90002,
                    program_uuid="program_cohort_test",
                    slug="cohort-test",
                    org_id=org_id,
                    name="Prepared program",
                    created_by_user_id=90200,
                )
            )
            db.add(
                Objective(
                    id=90002,
                    objective_uuid="objective_cohort_test",
                    org_id=org_id,
                    title="Prepared objective",
                    badge_id=1,
                    created_by_user_id=1,
                )
            )
            db.flush()
            db.add(ProgramObjective(id=90002, program_id=90002, objective_id=90002))
            for identifier in identifiers - {90200}:
                db.add(
                    ProgramAssignment(
                        id=identifier,
                        assignment_uuid=f"assignment_cohort_test_{identifier}",
                        org_id=org_id,
                        program_id=90002,
                        user_id=identifier,
                        subject_email=f"fake{identifier}@example.com",
                        owner_user_id=90200,
                        staff_user_ids=[90200, 1],
                        created_by_user_id=90200,
                    )
                )
            db.flush()
            for identifier in identifiers - {90200}:
                db.add(
                    ProgramParticipant(
                        participant_uuid=f"participant_cohort_test_{identifier}",
                        assignment_id=identifier,
                        org_id=org_id,
                        user_id=identifier,
                        status="accepted",
                    )
                )
                db.add(
                    ObjectiveProgress(
                        progress_uuid=f"progress_cohort_test_{identifier}",
                        org_id=org_id,
                        objective_id=90002,
                        user_id=identifier,
                        status=["not_started", "in_progress", "completed"][
                            identifier % 3
                        ],
                        completed_by_user_id=1,
                    )
                )
            db.flush()
            snapshot = capture(db, 90200, org_id, identifiers)
            assert {row["id"] for row in snapshot["user"]} == identifiers
            assert all(
                row["first_name"] == f"Stage {row['id']}" for row in snapshot["user"]
            )
            assert len(snapshot["userorganization"]) == 20
            assert (
                len(snapshot["programparticipant"])
                == len(snapshot["objectiveprogress"])
                == 19
            )
            assert {row["status"] for row in snapshot["objectiveprogress"]} == {
                "not_started",
                "in_progress",
                "completed",
            }
            assert all(
                row["completed_by_user_id"] is None
                for row in snapshot["objectiveprogress"]
            )
            assert all(
                row["staff_user_ids"] == [90200]
                for row in snapshot["programassignment"]
            )
            assert any(row["id"] == 1 for row in snapshot["learningbadge"])
            for name in (
                "learningbadgeversion",
                "learningpath",
                "learningactivity",
                "learningpage",
            ):
                assert any(row["id"] == 1 for row in snapshot[name]), name
            authorization = next(
                row
                for row in snapshot["badgeissuerauthorization"]
                if row["issuer_org_id"] == org_id
            )
            assert (
                authorization["status"] == "approved"
                and authorization["decided_by_user_id"] is None
            )
            assert [row["user_id"] for row in snapshot["resourceauthor"]] == [90200]
            assert [row["email"] for row in snapshot["planinvitation"]] == [
                "fake90201@example.com"
            ]
            resource = next(row for row in snapshot["resource"] if row["id"] == 90002)
            assert (
                resource["title"] == "Live shared catalog resource"
                and resource["created_by_user_id"] is None
            )
            assert (
                next(row for row in snapshot["objective"] if row["id"] == 90002)[
                    "created_by_user_id"
                ]
                is None
            )
            db.rollback()
    finally:
        engine.dispose()
