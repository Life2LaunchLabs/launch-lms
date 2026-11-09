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
# How you eat: the four USDA food plans, cheapest to most generous. Moderate is closest to what people actually spend.
FOOD_PLAN = {"key": "plan", "title": "How you eat", "kind": "choice", "default": "moderate", "choices": [["thrifty", "Thrifty"], ["low", "Low-cost"], ["moderate", "Moderate"], ["liberal", "Liberal"]]}
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
    {"key": "dorm", "cat": "home", "title": "Dorm", "icon": "building", "metric": "room_board"},
    {"key": "utilities", "cat": "home", "title": "Utilities and internet", "icon": "plug", "metric": "utilities", "settings": [SHARE]},
    {"key": "renters_insurance", "cat": "home", "title": "Renter's insurance", "icon": "shield"},
    {"key": "property_tax", "cat": "home", "title": "Property tax", "icon": "landmark"},
    {"key": "home_insurance", "cat": "home", "title": "Home insurance", "icon": "shield"},
    {"key": "home_upkeep", "cat": "home", "title": "Home upkeep", "icon": "wrench"},
    # Food
    {"key": "groceries", "cat": "food", "title": "Groceries", "icon": "shopping-cart", "metric": "groceries", "settings": [FOOD_PLAN]},
    {"key": "eating_out", "cat": "food", "title": "Eating out", "icon": "utensils"},
    {"key": "meal_plan", "cat": "food", "title": "Meal plan", "icon": "utensils"},
    # Getting around
    {"key": "transport", "cat": "move", "title": "Getting around", "icon": "bus", "metric": "transport"},
    {"key": "bus_pass", "cat": "move", "title": "Bus pass", "icon": "bus"},
    {"key": "gas", "cat": "move", "title": "Gas", "icon": "fuel"},
    {"key": "car_insurance", "cat": "move", "title": "Car insurance", "icon": "shield"},
    {"key": "car_repairs", "cat": "move", "title": "Car repairs", "icon": "wrench"},
    {"key": "rideshare", "cat": "move", "title": "Rides and rideshare", "icon": "car"},
    {"key": "bike", "cat": "move", "title": "Bike upkeep", "icon": "bike"},
    # School
    {"key": "tuition", "cat": "school", "title": "Tuition and fees", "icon": "graduation-cap", "metric": "tuition"},
    {"key": "books", "cat": "school", "title": "Books and supplies", "icon": "book-open", "metric": "books"},
    # Free time
    {"key": "hobby", "cat": "fun", "title": "A hobby", "icon": "palette"},
    {"key": "going_out", "cat": "fun", "title": "Going out", "icon": "ticket", "metric": "going_out"},
    {"key": "streaming", "cat": "fun", "title": "Streaming and music", "icon": "music"},
    {"key": "gym", "cat": "fun", "title": "Gym", "icon": "dumbbell"},
    {"key": "travel", "cat": "fun", "title": "Trips", "icon": "plane"},
    {"key": "pet", "cat": "fun", "title": "A pet", "icon": "paw-print"},
    # Bills and personal
    {"key": "phone", "cat": "bills", "title": "Phone plan", "icon": "smartphone", "metric": "phone"},
    {"key": "health_insurance", "cat": "bills", "title": "Health insurance", "icon": "heart-pulse"},
    {"key": "clothes", "cat": "bills", "title": "Clothes", "icon": "shirt", "metric": "clothes"},
    {"key": "personal_care", "cat": "bills", "title": "Personal care", "icon": "sparkles", "metric": "personal_care"},
    {"key": "subscriptions", "cat": "bills", "title": "Subscriptions", "icon": "repeat"},
]

# How each metric's facts are broken down. Required dims must match exactly; the rest
# are dropped one at a time, from the end, when no fact has them.
METRICS = {
    "rent": {"title": "Rent", "dims": ["bedrooms"], "required": []},
    "wage": {"title": "Pay", "dims": ["soc"], "required": ["soc"]},
    "tuition": {"title": "Tuition and fees", "dims": ["school", "residency"], "required": ["school", "residency"]},
    # A school's own cost-of-attendance budget (College Scorecard / IPEDS).
    "room_board": {"title": "Room and board", "dims": ["school", "housing"], "required": ["school", "housing"]},
    "books": {"title": "Books and supplies", "dims": ["school"], "required": ["school"]},
    "other_costs": {"title": "Other school-year costs", "dims": ["school", "housing"], "required": ["school", "housing"]},
    # Everyday costs with no breakdown yet: a place-level or national figure each, once a source is loaded.
    # Groceries add up USDA's per-person food plan costs for the household, at local prices for goods.
    "groceries": {"title": "Groceries", "dims": ["plan", "adults", "kids"], "required": [], "compose": "food_plan", "scale": "price_goods"},
    "utilities": {"title": "Utilities and internet", "dims": [], "required": []},
    # What households of your size spend (BLS), at local prices.
    "transport": {"title": "Getting around", "dims": ["size"], "required": [], "scale": "price_all"},
    "phone": {"title": "Phone plan", "dims": ["size"], "required": []},
    "clothes": {"title": "Clothes", "dims": ["size"], "required": [], "scale": "price_goods"},
    "going_out": {"title": "Going out", "dims": ["size"], "required": [], "scale": "price_services"},
    "personal_care": {"title": "Personal care", "dims": ["size"], "required": [], "scale": "price_all"},
    # Inputs, not budget lines: USDA's cost per person, and BEA's price levels (US = 100).
    "food_plan": {"title": "Food plan cost per person", "dims": ["plan", "group"], "required": ["plan", "group"]},
    **{m: {"title": f"Price level, {t}", "dims": [], "required": []} for m, t in (("price_all", "all items"), ("price_goods", "goods"), ("price_rents", "rents"), ("price_utilities", "utilities"), ("price_services", "other services"))},
    # Outlook by occupation (Oregon Employment Department projections).
    "openings": {"title": "Openings a year", "dims": ["soc"], "required": ["soc"]},
    "growth": {"title": "Change in jobs", "dims": ["soc"], "required": ["soc"]},
    "employment": {"title": "Jobs", "dims": ["soc"], "required": ["soc"]},
    "employment_projected": {"title": "Projected jobs", "dims": ["soc"], "required": ["soc"]},
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
    {"key": "k401", "title": "401(k) through work"},
    {"key": "ira", "title": "IRA"},
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
