from sqlmodel import select

from src.db.organizations import Organization
from src.db.planning import Plan, PlanInvitationCreate
from src.services import planning
from src.tests.test_planning import NOW, _plan_create, _session, _user


def test_invitation_identifies_source_organization_and_personal_inviter():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Career preparation"))
        planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(email="helper@example.com", role_key="viewer"))
        personal = planning.list_my_invitations(db, _user(2))[0]
        assert personal["source_organization"] is None
        assert personal["invited_by"]["name"] == "Plan Owner"
        assert planning.list_my_invitations(db, _user(1)) == []
        org = Organization(id=1, org_uuid="org_academy", name="Inviting Academy", slug="academy", email="school@example.com", creation_date=NOW, update_date=NOW)
        db.add(org)
        plan = db.exec(select(Plan).where(Plan.plan_uuid == created["plan_uuid"])).one()
        plan.source_org_id = 1
        db.add(plan)
        db.commit()
        managed = planning.list_my_invitations(db, _user(2))[0]
        assert managed["source_organization"]["name"] == "Inviting Academy"
        assert managed["source_organization"]["slug"] == "academy"
        assert managed["role"] == personal["role"]
