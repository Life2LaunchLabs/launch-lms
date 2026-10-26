"""Templates and the question library: ordinary specs to start from.

A template is a dashboard's worth of cards for one scope; a question is one card. Neither is special once
used: choosing one copies its specs into an ordinary dashboard or card. ``test_insights_dashboards`` checks
every spec here validates on its scopes.
"""

from __future__ import annotations


def card(key: str, span: int, measure: str, **spec) -> dict:
    return {"key": key, "span": span, "spec": {"measure": measure, **spec}}


TEMPLATES: list[dict] = [
    {"key": "org.overview", "scope": "org", "title": "Org overview", "description": "The key numbers, who is on track, and plans and groups compared.", "cards": [
        card("active", 3, "active_learners"),
        card("finished", 3, "plans_finished"),
        card("completion", 3, "completion_rate"),
        card("badges", 3, "badges_awarded"),
        card("active_weeks", 7, "active_learners", by="time", compare="year"),
        card("status", 5, "learner_status"),
        card("plans", 6, "completion_rate", by="plan"),
        card("groups", 6, "learner_status", by="group"),
        card("joined", 7, "new_learners", by="time"),
        card("joined_groups", 5, "new_learners", by="group"),
    ]},
    {"key": "org.board", "scope": "org", "title": "Board summary", "description": "Totals for a board or funder: who you reached, what they finished, what they earned.", "cards": [
        card("active", 3, "active_learners", range="12m"),
        card("finished", 3, "plans_finished", range="12m"),
        card("completion", 3, "completion_rate", range="12m"),
        card("badges", 3, "badges_awarded", range="12m"),
        card("active_months", 12, "active_learners", by="time", range="12m", compare="year"),
        card("plans", 6, "plans_finished", by="plan", range="12m"),
        card("routes", 6, "badges_awarded", by="route", range="12m"),
    ]},
    {"key": "plan.performance", "scope": "plan", "title": "Plan performance", "description": "Starts, completion, time to finish, and how versions and groups compare.", "cards": [
        card("starts", 3, "plan_starts"),
        card("completion", 3, "completion_rate"),
        card("time", 3, "time_to_finish"),
        card("badges", 3, "badges_awarded"),
        card("starts_weeks", 7, "plan_starts", by="time", compare="year"),
        card("status", 5, "learner_status"),
        card("versions", 6, "completion_rate", by="version"),
        card("groups", 6, "completion_rate", by="group"),
    ]},
    {"key": "plan.badge", "scope": "plan", "title": "Badge issuing", "description": "How many earned the badge, and how.", "cards": [
        card("badges", 4, "badges_awarded"),
        card("finished", 4, "plans_finished"),
        card("completion", 4, "completion_rate"),
        card("badges_weeks", 7, "badges_awarded", by="time"),
        card("routes", 5, "badges_awarded", by="route"),
    ]},
    {"key": "group.progress", "scope": "group", "title": "Group progress", "description": "Who is on track, behind or quiet, and how the group's plans are going.", "cards": [
        card("active", 3, "active_learners"),
        card("finished", 3, "plans_finished"),
        card("completion", 3, "completion_rate"),
        card("joined", 3, "new_learners"),
        card("status", 5, "learner_status"),
        card("active_weeks", 7, "active_learners", by="time"),
        card("plans", 12, "completion_rate", by="plan"),
    ]},
    {"key": "group.weekly", "scope": "group", "title": "Weekly check-in", "description": "Who needs a look this week.", "cards": [
        card("status", 6, "learner_status"),
        card("active_days", 6, "active_learners", by="time", range="28d"),
    ]},
]

# Starter dashboards, made the first time an organization opens Insights.
STARTERS = ("org.overview", "plan.performance", "group.progress")

QUESTIONS: list[dict] = [
    {"key": "active_weekly", "text": "How many learners are active each week?", "spec": {"measure": "active_learners", "by": "time", "compare": "year"}},
    {"key": "who_needs_a_look", "text": "Who is on track, behind or quiet?", "spec": {"measure": "learner_status"}},
    {"key": "groups_on_track", "text": "Which groups are most on track?", "spec": {"measure": "learner_status", "by": "group"}},
    {"key": "plans_finish", "text": "Which plans finish most often?", "spec": {"measure": "completion_rate", "by": "plan"}},
    {"key": "completion", "text": "What share of started plans finish?", "spec": {"measure": "completion_rate"}},
    {"key": "groups_finish", "text": "Which groups finish their plans most often?", "spec": {"measure": "completion_rate", "by": "group"}},
    {"key": "versions", "text": "Does the new version finish more often?", "spec": {"measure": "completion_rate", "by": "version"}},
    {"key": "how_long", "text": "How long do plans take to finish?", "spec": {"measure": "time_to_finish"}},
    {"key": "slowest_plans", "text": "Which plans take longest?", "spec": {"measure": "time_to_finish", "by": "plan"}},
    {"key": "starts_weekly", "text": "When do learners start plans?", "spec": {"measure": "plan_starts", "by": "time", "compare": "year"}},
    {"key": "most_started", "text": "Which plans are started most?", "spec": {"measure": "plan_starts", "by": "plan"}},
    {"key": "joined", "text": "How many new learners joined?", "spec": {"measure": "new_learners", "by": "time"}},
    {"key": "badges_route", "text": "How many badges were awarded, and how?", "spec": {"measure": "badges_awarded", "by": "route"}},
    {"key": "badges_plans", "text": "Which badges are earned most?", "spec": {"measure": "badges_awarded", "by": "plan"}},
    {"key": "finished_weekly", "text": "How many plans are finished each week?", "spec": {"measure": "plans_finished", "by": "time"}},
]


def template(key: str) -> dict | None:
    return next((item for item in TEMPLATES if item["key"] == key), None)


def library(scope: str, see_reports: bool) -> dict:
    """The templates and questions that fit a ``scope`` dashboard for this viewer."""
    from src.services.insights.spec import CardSpec, check

    def fits(spec: dict) -> bool:
        return not check(CardSpec.model_validate(spec), scope, see_reports=see_reports)

    return {
        "templates": [{**item, "cards": [entry for entry in item["cards"] if fits(entry["spec"])]} for item in TEMPLATES if item["scope"] == scope],
        "questions": [item for item in QUESTIONS if fits(item["spec"])],
    }
