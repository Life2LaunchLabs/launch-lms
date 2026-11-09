"""The portfolio's skill chips and their O*NET elements stay in step with the web's chip list."""

import re
from pathlib import Path

import pytest

from src.services.life_plans import skill_words

TRAIT_OPTIONS = Path(__file__).resolve().parents[3] / "web" / "components" / "Portfolio" / "traitOptions.ts"


def _web_skill_ids() -> list[str]:
    text = TRAIT_OPTIONS.read_text(encoding="utf-8")
    block = text[text.index("PORTFOLIO_STRENGTHS"):]
    block = block[:block.index("].flatMap")]
    words = [word for inner in re.findall(r"\[('[^\[\]]*')\]", block) for word in re.findall(r"'([^']*)'", inner)]
    # The same id the web makes: lower case, each run of non-word characters a dash.
    return [re.sub(r"\W+", "-", word.lower()) for word in words]


@pytest.mark.skipif(not TRAIT_OPTIONS.exists(), reason="the web app isn't checked out beside the API")
def test_every_web_skill_chip_has_onet_elements():
    web = _web_skill_ids()
    assert len(web) > 30
    assert sorted(set(web) - set(skill_words.CHIPS)) == []
    assert sorted(set(skill_words.CHIPS) - set(web)) == []


def test_used_keeps_the_learners_order_and_ignores_unknown_chips():
    assert skill_words.used(["coding", "made-up", "staying-calm", "fixing-things"], ["1.D.4.a", "2.B.3.e"]) == ["coding", "staying-calm"]
    assert skill_words.used([], ["2.B.3.e"]) == []
