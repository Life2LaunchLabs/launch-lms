"""Conservative preflight token reservations, serialized across API workers.

Failed calls retain their reservation. No post-call refund race or restart can
overspend the configured ceiling. These are token budgets, not dollar estimates.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session
from src.db.demo import DemoUsage
from src.services.demo.configuration import configuration
from src.services.demo.context import current_demo


def reserve(engine, tokens: int) -> None:
    context = current_demo.get()
    if not context:
        return
    with Session(engine) as db:
        config = configuration(db, lock=True)
        now = datetime.utcnow()
        keys = [
            f"day:{now:%Y-%m-%d}",
            f"visitor:{context.visitor_id}:{now:%Y-%m-%d}",
            f"minute:{context.visitor_id}:{now:%Y-%m-%d-%H-%M}",
        ]
        entries = [db.get(DemoUsage, key) or DemoUsage(id=key) for key in keys]
        if entries[0].tokens + tokens > config.ai_tokens_per_day:
            raise HTTPException(
                429,
                "The demo's daily AI allowance has been used. You can keep exploring other features.",
            )
        if entries[1].tokens + tokens > config.ai_tokens_per_visitor:
            raise HTTPException(
                429,
                "You've reached today's demo AI allowance. You can keep exploring other features.",
            )
        if entries[2].requests >= config.ai_requests_per_minute:
            raise HTTPException(
                429,
                "Please wait a minute before sending another demo AI request.",
                headers={"Retry-After": "60"},
            )
        for entry in entries:
            entry.tokens += tokens
            entry.requests += 1
            db.add(entry)
        db.commit()
