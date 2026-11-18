"""No Life2Launch accounts for anyone under 13 (DEV-38, COPPA).

Every self-service way to create an account (sign-up, sign-up from an organization, an invitation or join link,
Get started, Google) sends the date of birth the person gave. It is checked here, and the account records that it
is over 13 and the day that was checked (`details.age_check`). The date itself is kept on the account
(`User.birth_date`, DEV-139) for suggestions by age and age-gated opportunities; it is never sent back in a response. Accounts an organization's
single sign-on provisions are the organization's to vouch for (the Terms of Use bar inviting anyone under 13).
"""

from datetime import date

from fastapi import HTTPException

from src.db.users import UserCreate, UserSignupCreate

MINIMUM_AGE = 13
UNDER_13_MESSAGE = "Sorry, we can't create a Life2Launch account for you. Accounts are for people 13 and older."


def age_on(birth_date: date, today: date) -> int:
    """Whole years old on `today`."""
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def verify(birth_date: date | None, today: date | None = None) -> dict:
    """The `details` entry recording the check; refuses (and nothing is created) when the date is missing, impossible or under 13."""
    today = today or date.today()
    if birth_date is None:
        raise HTTPException(status_code=400, detail={"code": "birth_date_required", "message": "Enter your date of birth to create an account."})
    if birth_date > today or birth_date.year < 1900:
        raise HTTPException(status_code=400, detail={"code": "birth_date_invalid", "message": "Enter a real date of birth."})
    if age_on(birth_date, today) < MINIMUM_AGE:
        raise HTTPException(status_code=403, detail={"code": "under_13", "message": UNDER_13_MESSAGE})
    return {"age_check": {"over_13": True, "checked_on": today.isoformat()}}


def checked_details(details: dict | None, birth_date: date | None) -> dict:
    """`details` with the check recorded (a client-sent `age_check` is replaced, never trusted)."""
    return {**(details or {}), **verify(birth_date)}


async def signup_body(user_object: UserSignupCreate) -> UserSignupCreate:
    """Route dependency for the sign-up bodies: refuses before anything is created; the date is kept on the account."""
    user_object.details = checked_details(user_object.details, user_object.birth_date)
    return user_object


async def create_body(user_object: UserCreate) -> UserCreate:
    """The same, for creating an account that joins no organization."""
    user_object.details = checked_details(user_object.details, user_object.birth_date)
    return user_object
