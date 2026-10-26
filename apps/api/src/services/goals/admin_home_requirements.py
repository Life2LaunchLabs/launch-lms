"""How learners are doing on the org's requirement frameworks, for the Home card that links to Insights.

Each framework says how many learners it tracks, the share of their requirements finished steps have
credited, and how many met all of them. It counts the same way as the Insights framework dashboard
(``services/insights/measures_requirements``): the newest tracking per learner, withdrawn ones left out.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.requirements import RequirementAttainmentSource, RequirementEnrollment, RequirementEnrollmentStatus, RequirementFramework

SHOWN = 4


def _frameworks(db: Session, org_id: int) -> list[RequirementFramework]:
    return list(db.exec(select(RequirementFramework).where(RequirementFramework.org_id == org_id, RequirementFramework.archived == False)  # noqa: E712
                        .order_by(RequirementFramework.name)).all())


def has_frameworks(db: Session, org_id: int) -> bool:
    return bool(_frameworks(db, org_id))


def requirements(db: Session, org_id: int) -> dict:
    frameworks = _frameworks(db, org_id)
    ids = [int(framework.id) for framework in frameworks]  # type: ignore[arg-type]
    newest: dict[tuple[int, int], RequirementEnrollment] = {}
    if ids:
        for enrollment in db.exec(select(RequirementEnrollment).where(col(RequirementEnrollment.framework_id).in_(ids),
                                                                      RequirementEnrollment.status != RequirementEnrollmentStatus.WITHDRAWN)).all():
            key = (int(enrollment.framework_id), int(enrollment.user_id))
            if key not in newest or int(enrollment.id) > int(newest[key].id):  # type: ignore[arg-type]
                newest[key] = enrollment
    met: dict[int, set[str]] = {}
    if newest:
        for source in db.exec(select(RequirementAttainmentSource).where(col(RequirementAttainmentSource.enrollment_id).in_([int(item.id) for item in newest.values()]),  # type: ignore[arg-type]
                                                                        RequirementAttainmentSource.revoked_at.is_(None))).all():  # type: ignore[union-attr]
            met.setdefault(int(source.enrollment_id), set()).add(source.node_uuid)
    rows = []
    for framework in frameworks:
        tracked = [item for (framework_id, _), item in newest.items() if framework_id == framework.id]
        needed = done = 0
        for enrollment in tracked:
            leaves = set((enrollment.framework_snapshot or {}).get("leaf_node_uuids") or [])
            needed += len(leaves)
            done += len(leaves & met.get(int(enrollment.id), set()))  # type: ignore[arg-type]
        rows.append({
            "framework_uuid": framework.framework_uuid, "name": framework.name, "learners": len(tracked),
            "progress": round(done / needed, 4) if needed else None,
            "completed": sum(1 for item in tracked if item.status == RequirementEnrollmentStatus.COMPLETED),
        })
    rows.sort(key=lambda row: (-row["learners"], row["name"]))
    return {"frameworks": rows[:SHOWN], "total": len(rows)}
