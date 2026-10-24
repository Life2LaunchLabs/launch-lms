"""Badges: finishing a plan with a badge awards it once, at the organization that ran it, as an Open Badges 3.0 credential."""

from sqlmodel import select

from src.db.badges import BadgeAward
from src.services.badges import awards, open_badges
from src.services.goals import templates
from src.tests.plan_world import PARTNER, _assign, _finish, _goal_of, _world
from src.tests.test_goals import ADMIN, LEARNER, _user


def test_finishing_awards_the_release_badge_once_and_it_reads_as_an_open_badge():
    db, (first, _) = _world()
    with db:
        first.description = "Handle change at work"
        db.add(first)
        db.commit()
        goal = _goal_of(db, _assign(db, PARTNER, first.template_uuid))
        _finish(db, goal)
        award = db.exec(select(BadgeAward)).one()
        assert (award.issuing_org_id, award.creator_org_id, award.goal_id, award.semver) == (PARTNER, 1, goal.id, "1.0.0")
        # The award keeps the achievement as earned, even after the plan's badge changes.
        document = templates.get_template(db, _user(ADMIN), 1, first.template_uuid)["document"]
        templates.save_template(db, _user(ADMIN), 1, first.template_uuid, {**document, "badge": {"kind": "Certification", "name": "Renamed"}})
        templates.publish(db, _user(ADMIN), 1, first.template_uuid, "Second")
        db.refresh(award)
        assert award.achievement["name"] == "Adaptability" and award.achievement["skills"] == ["Adaptability"]
        # Another plan finished for the same badge awards nothing new.
        _finish(db, _goal_of(db, _assign(db, 1, first.template_uuid)))
        assert len(db.exec(select(BadgeAward)).all()) == 1
        assert [item.award_uuid for item in awards.awards_of(db, LEARNER)] == [award.award_uuid]

        credential = open_badges.credential(db, award)
        assert credential["type"] == ["VerifiableCredential", "OpenBadgeCredential"]
        assert credential["issuer"]["name"] == "Partner" and credential["credentialSubject"]["identifier"][0]["hashed"] is True
        earned = credential["credentialSubject"]["achievement"]
        assert (earned["name"], earned["achievementType"], earned["version"], earned["tag"]) == ("Adaptability", "Badge", "1.0.0", ["Adaptability"])
        assert earned["creator"]["name"] == "Studio" and earned["criteria"]["id"].endswith(f"/discover/plans/{first.template_uuid}")
        assert "Notice change" in earned["criteria"]["narrative"] and earned["description"] == "Handle change at work"
        assert credential["evidence"][0]["genre"] == "Plan completion"
        assert awards.award_dict(db, award)["issuing_org"]["name"] == "Partner"


def test_plans_without_a_badge_award_nothing():
    from src.tests.test_goals import _published
    from src.tests.plan_world import STEPS

    db, _ = _world()
    with db:
        plain = _published(db, *STEPS)
        _finish(db, _goal_of(db, _assign(db, 1, plain.template_uuid)))
        assert db.exec(select(BadgeAward)).all() == []
