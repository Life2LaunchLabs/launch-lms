"""Greetings keep a title with the name (DEV-204)."""

from types import SimpleNamespace

from src.services.users.names import first_name_of, shown_first_name


def _user(preferred="", first="", last=""):
    return SimpleNamespace(preferred_name=preferred, first_name=first, last_name=last, username="u")


def test_title_first_name_is_kept_whole():
    assert shown_first_name(_user(preferred="Ms. Rivera", first="Ana", last="Rivera")) == "Ms. Rivera"
    assert shown_first_name(_user(preferred="Coach Diaz")) == "Coach Diaz"
    assert shown_first_name(_user(preferred="dr  Ana Lopez")) == "dr Ana Lopez"


def test_bare_title_borrows_the_last_name():
    assert shown_first_name(_user(first="Ms.", last="Rivera")) == "Ms. Rivera"
    assert first_name_of("Mr.") == "Mr."


def test_plain_names_greet_by_first_word():
    assert shown_first_name(_user(preferred="Lola Diaz", first="Dolores")) == "Lola"
    assert shown_first_name(_user(first="Mary Ann", last="Lee")) == "Mary"
    assert shown_first_name(_user(first="Miles")) == "Miles"  # starts like "Miss", isn't a title
    assert shown_first_name(_user()) == ""
