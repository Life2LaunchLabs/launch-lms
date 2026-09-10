import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from src.db.planning import PlanObjectiveCreate, PlanUpdate
from src.services import planning
from src.services.hub_context import HubSurfaceHint, page_context, visible_receipt
from src.tests.test_planning import _session, _user, _plan_create


def test_page_context_uses_current_saved_definitions_and_never_private_fields():
    with _session() as db, patch('src.services.hub_context.require_org_membership'):
        plan = planning.create_plan(db, _user(1), _plan_create('Design career'))
        updated = planning.create_objective(db, _user(1), plan['slug'], PlanObjectiveCreate(title='Compare roles', description='Compare two roles'))
        objective = updated['objectives'][0]
        hint = HubSurfaceHint(surface='plan', entity_id=plan['plan_uuid'], selected_objective_id=objective['objective_uuid'], page_path='/orgs/default/plans?plan=career', page_title='Plans | Career')
        result = page_context(db, 1, 1, hint)
        assert result['receipt']['status'] == 'ready'
        assert result['facts'][0]['objectives'][0]['title'] == 'Compare roles'
        assert result['receipt']['sources'][0]['page_path'] == '/orgs/default/plans?plan=career'
        assert result['receipt']['sources'][0]['page_title'] == 'Plans | Career'
        assert 'field_values' not in json.dumps(result)
        assert 'reviewer_note' not in json.dumps(result)
        planning.update_plan(db, _user(1), plan['slug'], PlanUpdate(name='New title'))
        assert page_context(db, 1, 1, hint)['facts'][0]['name'] == 'New title'


def test_forged_inaccessible_and_deleted_targets_do_not_supply_context():
    with _session() as db, patch('src.services.hub_context.require_org_membership'):
        plan = planning.create_plan(db, _user(1), _plan_create('Private name'))
        hint = HubSurfaceHint(surface='plan', entity_id=plan['plan_uuid'])
        receipt = page_context(db, 1, 1, hint)['receipt']
        assert page_context(db, 1, 2, hint)['facts'] == []
        assert visible_receipt(db, receipt, 1, 2)['sources'] == []
        hint.selected_objective_id = 'foreign-objective'
        assert page_context(db, 1, 1, hint)['receipt']['status'] == 'unavailable'
        assert page_context(db, 1, 1, None)['receipt']['status'] == 'off'


def test_client_cannot_supply_facts_or_permissions():
    with pytest.raises(ValidationError):
        HubSurfaceHint(surface='plan', entity_id='x', capabilities=['view_plan'])
    with pytest.raises(ValidationError):
        HubSurfaceHint(surface='plans', visible_ids=['x'] * 21)


def test_group_plan_context_uses_shared_definition_without_learner_rows():
    assignment = SimpleNamespace(
        assignment_uuid='assignment_group', due_date='2026-09-30',
        active=True, update_date='2026-09-09T12:00:00',
    )
    matrix = {
        'cohort': {'name': 'Class of 2026'},
        'program': {'description': 'Prepare for the next step.'},
        'phases': [{
            'name': 'Junior year', 'due_date': '2026-09-08',
            'objectives': [{'objective_uuid': 'objective_1', 'title': 'Talk to our career counselor', 'description': 'Get help weighing options.'}],
        }],
        'learners': [{'name': 'Learner secret', 'cells': {'objective_1': {'staff_note': 'Private note'}}}],
    }
    with _session() as db, patch('src.services.hub_context.require_org_membership'), patch('src.services.hub_context._group_matrix', return_value=(matrix, assignment)):
        result = page_context(db, 1, 1, HubSurfaceHint(surface='group_plan', entity_id='assignment_group'))
        assert result['receipt']['status'] == 'ready'
        assert result['facts'][0]['name'] == 'Class of 2026’s plan'
        assert result['facts'][0]['objectives'][0]['title'] == 'Talk to our career counselor'
        assert 'Learner secret' not in json.dumps(result)
        assert 'Private note' not in json.dumps(result)
        assert visible_receipt(db, result['receipt'], 1, 1)['sources'][0]['assignment_id'] == 'assignment_group'
