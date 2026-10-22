import logging

from fastapi import HTTPException
from sqlmodel import Session, select
from src.db.payments.payments import PaymentsConfig
from src.db.payments.payments_offers import PaymentsOffer

logger = logging.getLogger(__name__)

async def get_offer_from_stripe_id(
    product_id: str, db_session: Session
) -> PaymentsOffer | None:
    """Helper function to get offer from Stripe product ID (new architecture)"""
    statement = select(PaymentsOffer).where(
        PaymentsOffer.provider_product_id == product_id
    )
    return db_session.exec(statement).first()


async def get_org_id_from_stripe_account(
    stripe_account_id: str,
    db_session: Session,
) -> int:
    """Get organization ID from Stripe account ID"""
    statement = select(PaymentsConfig).where(
        PaymentsConfig.provider_specific_id == stripe_account_id
    )
    config = db_session.exec(statement).first()

    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"No organization found for Stripe account {stripe_account_id}",
        )

    return config.org_id
