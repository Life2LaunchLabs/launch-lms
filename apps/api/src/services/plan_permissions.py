"""Apply source-controlled definition policy to live-plan permissions."""
from sqlmodel import Session

from src.db.planning import Plan
from src.db.programs import Program, ProgramAssignment
from src.security.org_auth import is_org_admin

DEFINITION_CAPABILITIES = {
    "edit_plan_details", "edit_structure", "edit_schedule", "manage_roles",
    "complete_plan", "delete_plan", "transfer_ownership",
}


def effective_plan_capabilities(db: Session, plan: Plan, user_id: int, capabilities: set[str]) -> set[str]:
    """Ownership/sharing never overrides a system or assigned definition lock."""
    program = db.get(Program, plan.source_program_id) if plan.source_program_id else None
    if plan.source_badge_id or (program and program.system_type == "starter"):
        return capabilities - DEFINITION_CAPABILITIES
    assignment = db.get(ProgramAssignment, plan.source_assignment_id) if plan.source_assignment_id else None
    if (assignment and assignment.created_by_user_id != plan.subject_user_id
            and not (plan.source_org_id and is_org_admin(user_id, plan.source_org_id, db))):
        return capabilities - DEFINITION_CAPABILITIES
    return capabilities
