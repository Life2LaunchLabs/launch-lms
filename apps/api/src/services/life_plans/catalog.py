"""What can go in a life plan budget: the categories and the ready-made items.

An item names the metric its estimate comes from, if any. Items without a metric
still work: the learner enters their own number. Settings are the knobs that pick
which fact applies (bedrooms) or turn a fact into a monthly amount (hours a week,
how many people share the rent).
"""

from __future__ import annotations

CATEGORIES = [
    {"key": "work", "side": "in", "title": "Work", "icon": "briefcase"},
    {"key": "aid", "side": "in", "title": "Help and aid", "icon": "hand-coins"},
    {"key": "other_in", "side": "in", "title": "Something else", "icon": "pencil"},
    {"key": "home", "side": "out", "title": "Home", "icon": "house", "expected": True},
    {"key": "food", "side": "out", "title": "Food", "icon": "utensils", "expected": True},
    {"key": "move", "side": "out", "title": "Getting around", "icon": "bus"},
    {"key": "school", "side": "out", "title": "School", "icon": "graduation-cap"},
    {"key": "fun", "side": "out", "title": "Free time", "icon": "heart"},
    {"key": "bills", "side": "out", "title": "Bills and personal", "icon": "receipt"},
    {"key": "other_out", "side": "out", "title": "Something else", "icon": "pencil"},
]

BEDROOMS = {"key": "bedrooms", "title": "Size", "kind": "choice", "default": 1, "choices": [[0, "Studio"], [1, "1 bedroom"], [2, "2 bedrooms"], [3, "3 bedrooms"], [4, "4 bedrooms"]]}
SHARE = {"key": "share", "title": "Split with", "kind": "choice", "default": 1, "choices": [[1, "Just me"], [2, "1 roommate"], [3, "2 roommates"], [4, "3 roommates"]]}

ITEMS = [
    # Work and aid
    {"key": "job", "cat": "work", "title": "A job", "icon": "briefcase", "metric": "wage", "settings": [{"key": "soc", "title": "Job", "kind": "occupation"}], "hourly": True},
    {"key": "side_gig", "cat": "work", "title": "Side gig", "icon": "sparkles"},
    {"key": "family_help", "cat": "aid", "title": "Help from family", "icon": "users"},
    {"key": "grant", "cat": "aid", "title": "Grant", "icon": "award"},
    {"key": "scholarship", "cat": "aid", "title": "Scholarship", "icon": "medal"},
    {"key": "allowance", "cat": "aid", "title": "Allowance", "icon": "piggy-bank"},
    # Home
    {"key": "rent", "cat": "home", "title": "Rent", "icon": "house", "metric": "rent", "settings": [BEDROOMS, SHARE]},
    {"key": "family_home", "cat": "home", "title": "Living with family", "icon": "house-heart"},
    {"key": "dorm", "cat": "home", "title": "Dorm", "icon": "building"},
    {"key": "utilities", "cat": "home", "title": "Utilities and internet", "icon": "plug"},
    {"key": "renters_insurance", "cat": "home", "title": "Renter's insurance", "icon": "shield"},
    # Food
    {"key": "groceries", "cat": "food", "title": "Groceries", "icon": "shopping-cart"},
    {"key": "eating_out", "cat": "food", "title": "Eating out", "icon": "utensils"},
    {"key": "meal_plan", "cat": "food", "title": "Meal plan", "icon": "utensils"},
    # Getting around
    {"key": "bus_pass", "cat": "move", "title": "Bus pass", "icon": "bus"},
    {"key": "gas", "cat": "move", "title": "Gas", "icon": "fuel"},
    {"key": "car_insurance", "cat": "move", "title": "Car insurance", "icon": "shield"},
    {"key": "car_repairs", "cat": "move", "title": "Car repairs", "icon": "wrench"},
    {"key": "rideshare", "cat": "move", "title": "Rides and rideshare", "icon": "car"},
    {"key": "bike", "cat": "move", "title": "Bike upkeep", "icon": "bike"},
    # School
    {"key": "tuition", "cat": "school", "title": "Tuition and fees", "icon": "graduation-cap"},
    {"key": "books", "cat": "school", "title": "Books and supplies", "icon": "book-open"},
    # Free time
    {"key": "hobby", "cat": "fun", "title": "A hobby", "icon": "palette"},
    {"key": "going_out", "cat": "fun", "title": "Going out", "icon": "ticket"},
    {"key": "streaming", "cat": "fun", "title": "Streaming and music", "icon": "music"},
    {"key": "gym", "cat": "fun", "title": "Gym", "icon": "dumbbell"},
    {"key": "travel", "cat": "fun", "title": "Trips", "icon": "plane"},
    {"key": "pet", "cat": "fun", "title": "A pet", "icon": "paw-print"},
    # Bills and personal
    {"key": "phone", "cat": "bills", "title": "Phone plan", "icon": "smartphone"},
    {"key": "health_insurance", "cat": "bills", "title": "Health insurance", "icon": "heart-pulse"},
    {"key": "clothes", "cat": "bills", "title": "Clothes", "icon": "shirt"},
    {"key": "personal_care", "cat": "bills", "title": "Personal care", "icon": "sparkles"},
    {"key": "subscriptions", "cat": "bills", "title": "Subscriptions", "icon": "repeat"},
]

# How each metric's facts are broken down. Required dims must match exactly; the rest
# are dropped one at a time, from the end, when no fact has them.
METRICS = {
    "rent": {"title": "Rent", "dims": ["bedrooms"], "required": []},
    "wage": {"title": "Pay", "dims": ["soc"], "required": ["soc"]},
    "tuition": {"title": "Tuition and fees", "dims": ["school", "residency"], "required": ["school", "residency"]},
}

ASSET_KINDS = [
    {"key": "car", "title": "Car", "icon": "car"},
    {"key": "home", "title": "Home", "icon": "house"},
    {"key": "other", "title": "Something else", "icon": "package"},
]

DEBT_KINDS = [
    {"key": "student_loan", "title": "Student loan"},
    {"key": "car_loan", "title": "Car loan"},
    {"key": "mortgage", "title": "Mortgage"},
    {"key": "card", "title": "Credit card"},
    {"key": "personal", "title": "Personal loan"},
    {"key": "other", "title": "Something else"},
]

SAVINGS_KINDS = [
    {"key": "savings", "title": "Savings account"},
    {"key": "retirement", "title": "Retirement (401k or IRA)"},
    {"key": "other", "title": "Something else"},
]


def catalog() -> dict:
    from src.services.life_plans.place_photos import photos_by_place

    return {
        "categories": CATEGORIES, "items": ITEMS, "metrics": METRICS, "asset_kinds": ASSET_KINDS, "debt_kinds": DEBT_KINDS, "savings_kinds": SAVINGS_KINDS,
        "place_photos": photos_by_place(),
    }


def item(key: str | None) -> dict | None:
    return next((i for i in ITEMS if i["key"] == key), None)
