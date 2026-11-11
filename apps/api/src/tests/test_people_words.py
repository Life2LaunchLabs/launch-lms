"""What an organization calls the people it supports (services/orgs/people_words.py)."""

import pytest
from pydantic import ValidationError
from sqlmodel import Session, SQLModel, create_engine

from src.db.organization_config import OrganizationConfig
from src.services.goals.admin_home_start import _note
from src.services.orgs import people_words
from src.services.orgs.onboarding import ROLES


def _db() -> Session:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine, tables=[OrganizationConfig.__table__])
    return Session(engine)


def test_an_org_without_a_word_says_participant_and_one_with_a_word_says_it():
    with _db() as db:
        db.add(OrganizationConfig(org_id=1, config={"customization": {"general": {"color": "#2F66D6"}}}))
        db.add(OrganizationConfig(org_id=2, config={"customization": {"general": {"people_one": "trainee", "people_many": "trainees"}}}))
        db.commit()
        assert people_words.words(db, 1) == ("participant", "participants")
        assert people_words.words(db, 2) == ("trainee", "trainees")
        assert people_words.words(db, 3) == ("participant", "participants")


def test_every_start_role_has_a_word_and_none_says_learner_or_youth():
    assert set(people_words.ROLE_WORDS) == set(ROLES)
    assert people_words.ROLE_WORDS["training"] == ("trainee", "trainees")
    assert not {word for pair in people_words.ROLE_WORDS.values() for word in pair} & {"learner", "learners", "youth"}


def test_words_are_tidied_and_must_be_words():
    assert people_words.PeopleWords(one="  Team   Member ", many="Team members").model_dump() == {"one": "team member", "many": "team members"}
    assert people_words.PeopleWords(one="camper", many="campers").one == "camper"
    for bad in ("", "<b>x</b>", "a" * 31, "trainee2"):
        with pytest.raises(ValidationError):
            people_words.PeopleWords(one=bad, many="trainees")


def test_getting_started_counts_people_in_the_orgs_word():
    assert _note("learners", 1, ("trainee", "trainees")) == "1 trainee"
    assert _note("learners", 3, ("trainee", "trainees")) == "3 trainees"
    assert _note("plan", 2, ("trainee", "trainees")) == "2 plans"
    assert _note("learners", 0, ("trainee", "trainees")) is None
