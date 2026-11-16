"""DEV-112: Coach's directions about the app match what's there, and its career facts match the career cards."""

from sqlmodel import Session, SQLModel, create_engine

from src.db.life_plans import CareerEntry, EstimateSource
from src.services.coach.app_notes import app_notes_for
from src.services.coach.career_facts import career_card_notes, career_routes


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[EstimateSource.__table__, CareerEntry.__table__])
    session = Session(engine)
    source = EstimateSource(key="onet-31-0", title="O*NET 31.0", license="CC BY 4.0")
    session.add(source)
    session.commit()
    for code, title, zone, education in (
        ("29-1131.00", "Veterinarian", 5, [{"level": 11, "pct": 92.0}, {"level": 8, "pct": 8.0}]),
        ("29-2056.00", "Veterinary Technologist and Technician", 3, [{"level": 5, "pct": 60.0}]),
        ("47-2111.00", "Electrician", 3, []),
    ):
        session.add(CareerEntry(code=code, soc=code[:7], title=title, job_zone=zone, interests={}, education=education, source_id=source.id, status="reviewed"))
    session.commit()
    return session


def test_routes_match_the_card_and_add_to_my_plans():
    # Same cases as routesFor's tests in apps/web/components/Goals/phases/__tests__/graph.test.ts.
    vet = career_routes("29-1131.00", "Veterinarians", 5, [{"level": 11, "pct": 80}, {"level": 8, "pct": 20}])
    assert vet[0]["steps"] == [("College", 4), ("Graduate school", 4), ("Veterinarian", None)]
    assert career_routes("29-1131.00", "Veterinarians", 5, [{"level": 8, "pct": 70}, {"level": 11, "pct": 30}])[0]["steps"][1] == ("Graduate school", 2)
    assert career_routes("29-1131.00", "Veterinarians", 5)[0]["steps"][1] == ("Graduate school", 2)
    emt = career_routes("29-2042.00", "Emergency Medical Technicians", 3)
    assert [[title for title, _ in route["steps"]] for route in emt] == [
        ["Certificate program", "Emergency Medical Technician"], ["2-year degree", "Emergency Medical Technician"], ["Entry job", "Emergency Medical Technician"],
    ]
    assert career_routes("47-2111.00", "Electricians", 3)[0]["steps"][0] == ("Electrician apprentice", 4)


def test_coach_gets_the_card_of_a_career_the_learner_names():
    with _session() as db:
        notes = career_card_notes(db, "how long is school to be a veterinarian?", [])
        assert "Career: Veterinarian (O*NET-SOC 29-1131.00)" in notes
        assert "College (4 years), Graduate school (4 years), then working as Veterinarian" in notes
        assert "never give a different number of years" in notes
        assert "Veterinary Technologist" not in notes


def test_coach_gets_the_card_of_a_career_resource_in_the_chat():
    with _session() as db:
        resource = {"resource_type": "career", "external_url": "https://www.onetonline.org/link/summary/29-2056.00"}
        notes = career_card_notes(db, "is this a good fit?", [resource])
        assert "Veterinary Technologist and Technician" in notes
        assert "Certificate program (1 year)" in notes
        assert career_card_notes(db, "what should I do this summer?", []) == ""


def test_app_notes_answer_each_reported_question():
    """The linked FEED reports: each question now brings the facts about what is really there."""
    cases = {
        "how do I switch organization?": ("Organizations and switching", "no Organizations menu"),
        "can my kids Ava and Leo have their own logins linked to me?": ("Families and parents", "own login"),
        "where do i find vet tech? can I search Discover?": ("Discover search and saving", "search box"),
        "how do I make the site call me Tony?": ("The name you go by", "Name you go by"),
        "how do i tell the people who make this site something didnt work": ("Sending feedback", "Feedback is near the bottom"),
    }
    for question, (title, fact) in cases.items():
        notes = app_notes_for(question)
        assert f'title="{title}"' in notes, question
        assert fact in notes, question
