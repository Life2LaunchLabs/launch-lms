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
        card("waiting", 4, "waiting_for_review"),
        card("turnaround", 4, "review_turnaround"),
        card("retention", 4, "retention", range="12m"),
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
        card("steps", 12, "step_reach", by="step"),
        card("reach", 7, "plan_reach", by="time", range="12m"),
        card("orgs", 5, "plan_reach", by="org", range="12m"),
    ]},
    {"key": "plan.reviews", "scope": "plan", "title": "Reviews", "description": "What waits for review, how long reviews take, and which steps are sent back.", "cards": [
        card("waiting", 4, "waiting_for_review"),
        card("turnaround", 4, "review_turnaround"),
        card("sent_back", 4, "sent_back_rate"),
        card("sent_back_steps", 7, "sent_back_rate", by="step"),
        card("waiting_steps", 5, "waiting_for_review", by="step"),
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
        card("waiting", 6, "waiting_for_review"),
        card("turnaround", 6, "review_turnaround", range="28d"),
    ]},
    {"key": "learner.overview", "scope": "learner", "title": "Learner overview", "description": "One learner's plans, steps, badges, check-ins and activity.", "cards": [
        card("plans", 3, "plan_starts", range="all"),
        card("finished", 3, "plans_finished", range="all"),
        card("steps", 3, "steps_done"),
        card("badges", 3, "badges_awarded", range="all"),
        card("progress", 5, "plan_progress", by="plan"),
        card("active_days", 7, "days_active", by="time"),
        card("steps_plans", 6, "steps_done", by="plan"),
        card("check_ins", 6, "check_ins", by="time"),
        card("waiting", 4, "waiting_for_review"),
        card("sent_back", 4, "sent_back_rate"),
        card("turnaround", 4, "review_turnaround"),
    ]},
    {"key": "framework.progress", "scope": "framework", "title": "Requirement progress",
     "description": "Who is tracked, how far each category and group is, which plans credit requirements, and who has met them all.", "cards": [
        card("tracked", 3, "learners_tracked"),
        card("progress", 3, "requirement_progress"),
        card("met", 3, "requirements_met", range="all"),
        card("completed", 3, "frameworks_completed", range="all"),
        card("categories", 6, "requirement_progress", by="category"),
        card("groups", 6, "requirement_progress", by="group"),
        card("met_weeks", 7, "requirements_met", by="time"),
        card("plans", 5, "requirements_met", by="plan", range="all"),
        card("category_groups", 12, "requirement_progress", by="category", by2="group"),
    ]},
]

# Starter dashboards: each is made once for an organization, the first time it opens Insights after the starter exists.
STARTERS = ("org.overview", "plan.performance", "group.progress", "learner.overview", "framework.progress")

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
    {"key": "drop_off", "text": "Where do learners drop off?", "spec": {"measure": "step_reach", "by": "step"}},
    {"key": "sent_back_steps", "text": "Which step is sent back most?", "spec": {"measure": "sent_back_rate", "by": "step"}},
    {"key": "sent_back_plans", "text": "Which plans are sent back most?", "spec": {"measure": "sent_back_rate", "by": "plan"}},
    {"key": "review_time", "text": "How long do reviews take?", "spec": {"measure": "review_turnaround", "by": "time"}},
    {"key": "waiting", "text": "What is waiting for review?", "spec": {"measure": "waiting_for_review", "by": "plan"}},
    {"key": "retention", "text": "Do learners stay active after joining?", "spec": {"measure": "retention", "by": "group"}},
    {"key": "issuing_orgs", "text": "Which organizations use this plan?", "spec": {"measure": "plan_reach", "by": "org"}},
    {"key": "reach_time", "text": "How many learners start this plan, everywhere?", "spec": {"measure": "plan_reach", "by": "time", "compare": "year"}},
    {"key": "steps_weekly", "text": "How many steps are done each week?", "spec": {"measure": "steps_done", "by": "time"}},
    {"key": "how_far", "text": "How far along are the running plans?", "spec": {"measure": "plan_progress", "by": "plan"}},
    {"key": "days_active", "text": "How often is this learner active?", "spec": {"measure": "days_active", "by": "time"}},
    {"key": "check_ins", "text": "How often does staff check in?", "spec": {"measure": "check_ins", "by": "time"}},
    {"key": "requirements_far", "text": "How far along are learners on their requirements?", "spec": {"measure": "requirement_progress", "by": "framework"}},
    {"key": "requirements_categories", "text": "Which categories of requirements are furthest behind?", "spec": {"measure": "requirement_progress", "by": "category"}},
    {"key": "requirements_plans", "text": "Which plans credit the most requirements?", "spec": {"measure": "requirements_met", "by": "plan", "range": "all"}},
    {"key": "requirements_weekly", "text": "How many requirements are met each week?", "spec": {"measure": "requirements_met", "by": "time"}},
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
