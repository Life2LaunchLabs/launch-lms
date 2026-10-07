from sqlmodel import Session
from src.services.hub_configuration import get_enabled_hub_advisor_credentials


def advisor_credentials(db_session: Session):
    from src.services.demo.context import current_demo

    if current_demo.get():
        from src.core.events.database import engine

        with Session(engine) as control:
            return get_enabled_hub_advisor_credentials(control)
    return get_enabled_hub_advisor_credentials(db_session)


def reserve_ai(payload: dict, output_tokens: int):
    from src.services.demo.context import current_demo

    if current_demo.get():
        import json
        from src.core.events.database import engine
        from src.services.demo.budgets import reserve

        reserve(
            engine,
            len(json.dumps(payload, ensure_ascii=False).encode()) + output_tokens,
        )


def generation_options(contents: list) -> dict:
    from src.services.demo.context import current_demo

    if not current_demo.get():
        return {}
    reserve_ai({"contents": contents}, 8192)
    return {"config": {"max_output_tokens": 8192}}
