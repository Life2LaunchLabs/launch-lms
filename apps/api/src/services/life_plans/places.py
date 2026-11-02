"""Places a life plan phase can be set in, and the ladder an estimate climbs.

Oregon is covered down to towns and counties; every other state is covered at the
state level. Each place resolves to a ladder of place keys, most specific first:
city, county, wage area, state, US. The resolver walks it and uses the first level
that has a reviewed fact.

Oregon counties map to the wage areas BLS uses for its Occupational Employment and
Wage Statistics (metro areas, and three nonmetropolitan areas), as listed on
https://www.bls.gov/OES/current/or_counties.htm (May 2024 estimates).
"""

from __future__ import annotations

import re

# Oregon county -> (county name, BLS OEWS area code, area name)
OR_COUNTIES: dict[str, tuple[str, str, str]] = {
    "baker": ("Baker County", "4100008", "Eastern Oregon"),
    "benton": ("Benton County", "0018700", "Corvallis"),
    "clackamas": ("Clackamas County", "0038900", "Portland area"),
    "clatsop": ("Clatsop County", "4100006", "the Oregon coast"),
    "columbia": ("Columbia County", "0038900", "Portland area"),
    "coos": ("Coos County", "4100006", "the Oregon coast"),
    "crook": ("Crook County", "0013460", "Bend area"),
    "curry": ("Curry County", "4100006", "the Oregon coast"),
    "deschutes": ("Deschutes County", "0013460", "Bend area"),
    "douglas": ("Douglas County", "4100006", "the Oregon coast"),
    "gilliam": ("Gilliam County", "4100007", "Central Oregon"),
    "grant": ("Grant County", "4100008", "Eastern Oregon"),
    "harney": ("Harney County", "4100008", "Eastern Oregon"),
    "hood-river": ("Hood River County", "4100007", "Central Oregon"),
    "jackson": ("Jackson County", "0032780", "Medford area"),
    "jefferson": ("Jefferson County", "0013460", "Bend area"),
    "josephine": ("Josephine County", "0024420", "Grants Pass area"),
    "klamath": ("Klamath County", "4100007", "Central Oregon"),
    "lake": ("Lake County", "4100007", "Central Oregon"),
    "lane": ("Lane County", "0021660", "Eugene-Springfield"),
    "lincoln": ("Lincoln County", "4100006", "the Oregon coast"),
    "linn": ("Linn County", "0010540", "Albany area"),
    "malheur": ("Malheur County", "4100008", "Eastern Oregon"),
    "marion": ("Marion County", "0041420", "Salem area"),
    "morrow": ("Morrow County", "4100008", "Eastern Oregon"),
    "multnomah": ("Multnomah County", "0038900", "Portland area"),
    "polk": ("Polk County", "0041420", "Salem area"),
    "sherman": ("Sherman County", "4100007", "Central Oregon"),
    "tillamook": ("Tillamook County", "4100006", "the Oregon coast"),
    "umatilla": ("Umatilla County", "4100008", "Eastern Oregon"),
    "union": ("Union County", "4100008", "Eastern Oregon"),
    "wallowa": ("Wallowa County", "4100008", "Eastern Oregon"),
    "wasco": ("Wasco County", "4100007", "Central Oregon"),
    "washington": ("Washington County", "0038900", "Portland area"),
    "wheeler": ("Wheeler County", "4100007", "Central Oregon"),
    "yamhill": ("Yamhill County", "0038900", "Portland area"),
}

# Oregon towns people pick, with the county each sits in (the county seat or main county).
OR_CITIES: dict[str, tuple[str, str]] = {
    "albany": ("Albany", "linn"),
    "ashland": ("Ashland", "jackson"),
    "astoria": ("Astoria", "clatsop"),
    "baker-city": ("Baker City", "baker"),
    "beaverton": ("Beaverton", "washington"),
    "bend": ("Bend", "deschutes"),
    "brookings": ("Brookings", "curry"),
    "burns": ("Burns", "harney"),
    "canby": ("Canby", "clackamas"),
    "coos-bay": ("Coos Bay", "coos"),
    "corvallis": ("Corvallis", "benton"),
    "cottage-grove": ("Cottage Grove", "lane"),
    "dallas": ("Dallas", "polk"),
    "enterprise": ("Enterprise", "wallowa"),
    "eugene": ("Eugene", "lane"),
    "florence": ("Florence", "lane"),
    "grants-pass": ("Grants Pass", "josephine"),
    "gresham": ("Gresham", "multnomah"),
    "hermiston": ("Hermiston", "umatilla"),
    "hillsboro": ("Hillsboro", "washington"),
    "hood-river": ("Hood River", "hood-river"),
    "john-day": ("John Day", "grant"),
    "keizer": ("Keizer", "marion"),
    "klamath-falls": ("Klamath Falls", "klamath"),
    "la-grande": ("La Grande", "union"),
    "lake-oswego": ("Lake Oswego", "clackamas"),
    "lakeview": ("Lakeview", "lake"),
    "lebanon": ("Lebanon", "linn"),
    "madras": ("Madras", "jefferson"),
    "mcminnville": ("McMinnville", "yamhill"),
    "medford": ("Medford", "jackson"),
    "monmouth": ("Monmouth", "polk"),
    "newberg": ("Newberg", "yamhill"),
    "newport": ("Newport", "lincoln"),
    "ontario": ("Ontario", "malheur"),
    "oregon-city": ("Oregon City", "clackamas"),
    "pendleton": ("Pendleton", "umatilla"),
    "portland": ("Portland", "multnomah"),
    "prineville": ("Prineville", "crook"),
    "redmond": ("Redmond", "deschutes"),
    "roseburg": ("Roseburg", "douglas"),
    "salem": ("Salem", "marion"),
    "sandy": ("Sandy", "clackamas"),
    "seaside": ("Seaside", "clatsop"),
    "springfield": ("Springfield", "lane"),
    "st-helens": ("St. Helens", "columbia"),
    "the-dalles": ("The Dalles", "wasco"),
    "tigard": ("Tigard", "washington"),
    "tillamook": ("Tillamook", "tillamook"),
    "woodburn": ("Woodburn", "marion"),
}

STATES: dict[str, str] = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

LEVEL_ORDER = ("city", "county", "area", "state", "us")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def level_of(key: str) -> str:
    return key.split(":", 1)[0] if key != "us" else "us"


def label(key: str | None) -> str:
    """A place key as people read it: "Eugene, OR", "Lane County, OR", "Oregon", "the US"."""
    if not key or key == "us":
        return "the US"
    parts = key.split(":")
    kind = parts[0]
    if kind == "state" and len(parts) == 2:
        return STATES.get(parts[1], parts[1])
    if kind == "county" and len(parts) == 3 and parts[1] == "OR" and parts[2] in OR_COUNTIES:
        return f"{OR_COUNTIES[parts[2]][0]}, OR"
    if kind == "city" and len(parts) == 3 and parts[1] == "OR" and parts[2] in OR_CITIES:
        return f"{OR_CITIES[parts[2]][0]}, OR"
    if kind == "area" and len(parts) == 2:
        names = {code: name for _, code, name in OR_COUNTIES.values()}
        return names.get(parts[1], f"area {parts[1]}")
    return key


def ladder(key: str | None) -> list[str]:
    """Place keys from the most specific to the US, for the resolver to try in order."""
    if not key or key == "us":
        return ["us"]
    parts = key.split(":")
    kind = parts[0]
    out: list[str] = []
    if kind == "city" and len(parts) == 3 and parts[1] == "OR" and parts[2] in OR_CITIES:
        out.append(key)
        kind, parts = "county", ["county", "OR", OR_CITIES[parts[2]][1]]
    if kind == "county" and len(parts) == 3 and parts[1] == "OR" and parts[2] in OR_COUNTIES:
        out.append(":".join(parts))
        out.append(f"area:{OR_COUNTIES[parts[2]][1]}")
        out.append("state:OR")
    elif kind == "state" and len(parts) == 2 and parts[1] in STATES:
        out.append(key)
    return out + ["us"]


def search(query: str, limit: int = 12) -> list[dict]:
    """Places matching what someone typed: Oregon towns and counties, then states."""
    q = query.strip().lower()
    rows: list[dict] = []
    for key, (name, county) in sorted(OR_CITIES.items(), key=lambda kv: kv[1][0]):
        rows.append({"key": f"city:OR:{key}", "label": f"{name}, OR", "detail": OR_COUNTIES[county][0], "level": "city"})
    for key, (name, _, area) in sorted(OR_COUNTIES.items()):
        rows.append({"key": f"county:OR:{key}", "label": f"{name}, OR", "detail": area, "level": "county"})
    for code, name in sorted(STATES.items(), key=lambda kv: kv[1]):
        rows.append({"key": f"state:{code}", "label": name, "detail": "Whole state", "level": "state"})
    if q:
        starts = [r for r in rows if r["label"].lower().startswith(q)]
        contains = [r for r in rows if q in r["label"].lower() and r not in starts]
        rows = starts + contains
    return rows[:limit]
