"""backfill plan links on legacy learning runs

Revision ID: m5n6o7p8q9r0
Revises: l4m5n6o7p8q9
"""

from alembic import op
import sqlalchemy as sa


revision = "m5n6o7p8q9r0"
down_revision = "l4m5n6o7p8q9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A legacy run identifies its assignment, participant/user, and badge. Link it
    # only when those fields resolve to exactly one live-plan objective; duplicate
    # uses of the same badge in one plan are intentionally left for manual repair.
    op.execute(sa.text("""
        WITH candidates AS (
            SELECT
                learningrun.id AS run_id,
                plan.id AS plan_id,
                planobjective.id AS plan_objective_id,
                count(*) OVER (PARTITION BY learningrun.id) AS candidate_count
            FROM learningrun
            JOIN programparticipant
              ON programparticipant.assignment_id = learningrun.program_assignment_id
             AND (
                    programparticipant.id = learningrun.program_participant_id
                 OR (
                        learningrun.program_participant_id IS NULL
                    AND programparticipant.user_id = learningrun.user_id
                 )
             )
            JOIN plan
              ON plan.source_assignment_id = learningrun.program_assignment_id
             AND plan.subject_user_id = programparticipant.user_id
            JOIN planobjective
              ON planobjective.plan_id = plan.id
             AND planobjective.badge_id = learningrun.badge_id
            WHERE learningrun.plan_id IS NULL
              AND learningrun.plan_objective_id IS NULL
        )
        UPDATE learningrun
           SET plan_id = candidates.plan_id,
               plan_objective_id = candidates.plan_objective_id
          FROM candidates
         WHERE learningrun.id = candidates.run_id
           AND candidates.candidate_count = 1
    """))


def downgrade() -> None:
    # This data repair is intentionally retained. Clearing these columns could
    # destroy legitimate plan links created after the migration ran.
    pass
