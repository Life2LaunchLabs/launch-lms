"""Deterministic Coach replies for local browser fixtures; never enabled in production."""

from __future__ import annotations

from src.services.hub_advisor import AdvisorMessage, AdvisorResult


class DeterministicUiTestProvider:
    """Local browser-fixture provider; it is never enabled in a production configuration."""

    def __init__(self, memory: bool = False, edit_scope: str | None = None):
        self.memory = memory
        self.edit_scope = edit_scope

    async def respond(self, messages: list[AdvisorMessage], safety_identifier: str) -> AdvisorResult:
        # Browser fixtures append trusted capability instructions and untrusted
        # grounding after the learner's text. Match only the learner-authored
        # portion so words in that context cannot select the fixture response.
        prompt = messages[-1].content.split("\n\n", 1)[0].casefold()
        if self.memory:
            return AdvisorResult(text='{"candidates": []}', model="ui-test-memory")
        from src.services.goals.coach_tools import parse_goal_tool_call, scope
        from src.services.hub_questions import ASK_LEARNER_TOOL, parse_question_call
        if prompt.startswith("my answers"):
            return AdvisorResult(text="Thanks, that helps. Let's start with something small this week.", model="ui-test-advisor")
        if "ask me" in prompt:
            blank = {"options": [], "allow_skip": False, "low_label": "", "high_label": "", "keep": "none", "variable_key": ""}
            questions = parse_question_call(ASK_LEARNER_TOOL, {"questions": [
                {**blank, "prompt": "How much time can you give this each week?", "kind": "single", "options": ["An hour", "A few hours", "Most days"]},
                {**blank, "prompt": "How sure are you about this direction?", "kind": "scale", "low_label": "Not sure", "high_label": "Very sure"},
                {**blank, "prompt": "Anything that might get in the way?", "kind": "text", "allow_skip": True},
            ]})
            return AdvisorResult(text="A few quick questions so I can tailor this.", model="ui-test-advisor", questions=tuple(questions))
        edit_scope = scope(self.edit_scope)
        if edit_scope == "goal":
            if "suggested stage" in prompt:
                if "all proposed stages have now been reviewed" not in prompt:
                    return AdvisorResult(text="I’ve recorded that choice. The other proposed stages are still ready for your review.", model="ui-test-advisor")
                settings = {"prompt": "", "max_words": 0, "list_label": "", "list_target": 0, "slot_labels": [], "options": [], "multiple": False, "event_date": "", "place": ""}
                operation = parse_goal_tool_call("propose_goal_steps", {"steps": [
                    {"type": "write", "title": "Clarify the target role", "description": "Define the kind of role and work environment to aim for.", "due_date": "", "stage_title": "Explore", "resource_uuid": "",
                     "settings": {**settings, "prompt": "What kind of role and workplace are you aiming for?"}},
                    {"type": "task", "title": "Map skills and gaps", "description": "Compare current experience with the requirements of promising roles.", "due_date": "", "stage_title": "Prepare", "resource_uuid": "",
                     "settings": {**settings, "list_label": "Skills to build", "list_target": 3}},
                    {"type": "task", "title": "Complete one practical experiment", "description": "Test the direction through a small project, course, or conversation.", "due_date": "", "stage_title": "Transition", "resource_uuid": "", "settings": settings},
                ]})
                return AdvisorResult(
                    text="The stages are set. I suggested three starting steps to look at next.",
                    model="ui-test-advisor", goal_operations=(operation,) if operation else (),
                )
            if "suggested step" in prompt:
                if "all proposed steps have now been reviewed" not in prompt:
                    return AdvisorResult(text="I’ve recorded that choice. The other proposed steps are still ready for your review.", model="ui-test-advisor")
                operation = parse_goal_tool_call("propose_edit_conclusion", {
                    "summary": "The goal now has a clear starting structure.",
                })
                return AdvisorResult(
                    text="That gives the goal a useful starting structure. If it looks right, we can finish this edit.",
                    model="ui-test-advisor",
                    goal_operations=(operation,) if operation else (),
                )
            operation = parse_goal_tool_call("propose_goal_stages", {"stages": [
                {"title": "Explore", "description": "Clarify the direction and compare realistic paths.", "timing": ""},
                {"title": "Prepare", "description": "Build the skills, evidence, and relationships needed to move.", "timing": ""},
                {"title": "Transition", "description": "Test opportunities and make the move deliberately.", "timing": ""},
            ]})
            return AdvisorResult(
                text="I suggested three stages on your goal. Add the ones that fit; nothing changes until you do.",
                model="ui-test-advisor",
                goal_operations=(operation,) if operation else (),
            )
        if "plan this goal" in prompt or "plan it with me" in prompt:
            return AdvisorResult(
                text="Happy to. Start a session and I'll suggest stages on the goal itself; you keep only what fits.",
                model="ui-test-advisor", action_destinations=("plan_goal",),
            )
        if "create a plan" in prompt or "start a plan" in prompt:
            return AdvisorResult(
                text="A goal can turn that direction into stages and next steps. You can start one and keep shaping it as you learn.",
                model="ui-test-advisor", action_destinations=("create_plan",),
            )
        if "timeline" in prompt or "portfolio" in prompt:
            return AdvisorResult(
                text="That sounds worth preserving in your story. You can add it to your portfolio timeline when you are ready.",
                model="ui-test-advisor", action_destinations=("add_timeline",),
            )
        return AdvisorResult(
            text="A plan can turn that direction into goals and next steps. You can start one and keep shaping it as you learn.",
            model="ui-test-advisor", action_destinations=("create_plan",),
        )
