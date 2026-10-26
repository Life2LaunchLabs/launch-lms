"""Headlines: the sentence a card reads as, written by rules rather than a model.

Each result shape has an ordered list of rules; the first whose condition holds writes the headline. Rules
only say what the numbers show: a change counts only when ``real_change`` says so, and too few rows says
"too few to say" before anything else. Words are for people who aren't analysts.
"""

from __future__ import annotations

from statistics import median

from src.services.insights.measures import Measure

# Rows below this many learners, plans or reviews are too few to rank or compare.
MIN_N = 10
TOP_ROWS = 12


# Numbers ------------------------------------------------------------------------------------------

def fmt(measure: Measure, value: float | None) -> str:
    if value is None:
        return "–"
    if measure.unit == "percent":
        return f"{round(value * 100)}%"
    if measure.unit == "days":
        days = round(value)
        return "1 day" if days == 1 else f"{days} days"
    if measure.unit == "hours":
        hours = round(value)
        return f"{round(value / 24)} days" if hours >= 72 else ("1 hour" if hours == 1 else f"{hours} hours")
    return f"{round(value):,}"


def plural(pair: tuple[str, str], count: float | None) -> str:
    return pair[0] if count is not None and round(count) == 1 else pair[1]


def phrase(measure: Measure, value: float | None) -> str:
    return plural(measure.phrase, value if measure.unit == "count" else None).format(v=fmt(measure, value))


def real_change(measure: Measure, current: dict, previous: dict) -> bool:
    """Whether the move from ``previous`` to ``current`` is big enough, on enough, to call a change."""
    cur, prev = current.get("v"), previous.get("v")
    if cur is None or prev is None or current.get("n", 0) < MIN_N or previous.get("n", 0) < MIN_N:
        return False
    if measure.kind == "rate":
        return abs(cur - prev) >= 0.03
    if measure.kind == "median":
        return prev > 0 and abs(cur - prev) / prev >= 0.15
    return abs(cur - prev) >= 3 and prev > 0 and abs(cur - prev) / prev >= 0.10


def _signed(number: int) -> str:
    return ("+" if number > 0 else "−" if number < 0 else "±") + f"{abs(number):,}"


def change_label(measure: Measure, cur: float | None, prev: float | None) -> str:
    if cur is None or prev is None:
        return ""
    if measure.kind == "rate":
        return f"{_signed(round((cur - prev) * 100))} pts"
    if measure.kind == "median":
        return f"{_signed(round(cur - prev))} {'h' if measure.unit == 'hours' else 'days'}"
    if prev == 0:
        return f"{_signed(round(cur))}"
    return f"{_signed(round((cur - prev) / prev * 100))}%"


def tone(measure: Measure, cur: float | None, prev: float | None, real: bool) -> str:
    if not real or cur is None or prev is None or cur == prev or measure.direction == "none":
        return "flat"
    better = cur > prev if measure.direction == "up" else cur < prev
    return "good" if better else "bad"


def _moved(measure: Measure, cur: float, prev: float) -> str:
    """'up 4 points', 'down 12%', 'down 3 days'."""
    word = "up" if cur > prev else "down"
    if measure.kind == "rate":
        points = abs(round((cur - prev) * 100))
        return f"{word} {points} point{'s' if points != 1 else ''}"
    if measure.kind == "median":
        return f"{word} {fmt(measure, abs(cur - prev))}"
    return f"{word} {abs(round((cur - prev) / prev * 100))}%"


# Headlines ----------------------------------------------------------------------------------------

def too_few(measure: Measure, n: int) -> str | None:
    if measure.kind in ("rate", "median") and n < MIN_N:
        return f"Too few to say yet ({n:,} {plural(measure.base, n)})"
    return None


def single(measure: Measure, current: dict, previous: dict | None, against: str, target: float | None = None) -> str:
    """One number, against the period before, last year, or a target."""
    first = too_few(measure, current.get("n", 0))
    if first:
        return first
    said = phrase(measure, current.get("v"))
    cur = current.get("v")
    if target is not None and cur is not None:
        ahead = cur >= target if measure.direction != "down" else cur <= target
        return f"{said}, {'meeting' if ahead else 'short of'} the goal of {fmt(measure, target)}"
    if previous is None or cur is None or previous.get("v") is None:
        return said
    if real_change(measure, current, previous):
        return f"{said}, {_moved(measure, cur, previous['v'])} on {against}"
    if min(current.get("n", 0), previous.get("n", 0)) < MIN_N:
        # Too little on one side to call it the same or different.
        return said
    return f"{said}, about the same as {against}"


def series(measure: Measure, points: list[dict], current: dict, previous: dict | None, against: str, compare: str, periods: str = "periods") -> str:
    """Over time: a clear peak, a real change on last year, a run of rises or falls, else the total."""
    values = [point["v"] for point in points if point.get("v") is not None]
    if measure.kind in ("count", "distinct") and len(values) >= 4:
        nonzero = [value for value in values if value > 0]
        top = max(values)
        if nonzero and top >= 5 and top > 1.5 * median(nonzero) and values.count(top) == 1:
            peak = next(point for point in points if point.get("v") == top)
            return f"{measure.label} peaked in {peak['period']} ({fmt(measure, top)})"
    if compare == "year" and previous is not None and real_change(measure, current, previous):
        return f"{measure.label} {'is' if measure.kind in ('rate', 'median') else 'are'} {_moved(measure, current['v'], previous['v'])} on {against}"
    if measure.kind in ("count", "distinct") and len(values) >= 4:
        tail = values[-4:]
        if all(b > a for a, b in zip(tail, tail[1:])):
            return f"{measure.label} rose {len(tail) - 1} {periods} running"
        if all(b < a for a, b in zip(tail, tail[1:])):
            return f"{measure.label} fell {len(tail) - 1} {periods} running"
    return single(measure, current, previous, against)


def ranked(measure: Measure, rows: list[dict], dimension_plural: str) -> str:
    """Leader and laggard, or that they're all about the same, or that too few have enough to compare."""
    enough = [row for row in rows if row.get("v") is not None and (measure.kind not in ("rate", "median") or row.get("n", 0) >= MIN_N)]
    if not enough:
        return f"Too few {dimension_plural} have enough to compare yet"
    if len(enough) == 1:
        return f"Only {enough[0]['label']} has enough {measure.base[1]} to compare" if measure.kind in ("rate", "median") else phrase(measure, enough[0]["v"]) + f" in {enough[0]['label']}"
    best, worst = enough[0], enough[-1]
    if not real_change(measure, {"v": best["v"], "n": max(best.get("n", 0), MIN_N)}, {"v": worst["v"], "n": max(worst.get("n", 0), MIN_N)}):
        return f"All {len(enough)} {dimension_plural} are about the same"
    template = measure.rank or "{a} leads ({av}); {b} trails ({bv})"
    return template.format(a=best["label"], av=fmt(measure, best["v"]), b=worst["label"], bv=fmt(measure, worst["v"]))


def split(measure: Measure, rows: list[dict]) -> str:
    """Learner status: how many of all are on track, and the biggest group needing a look."""
    counts = {row["key"]: row.get("v") or 0 for row in rows}
    total = round(sum(counts.values()))
    if not total:
        return "No learners with a plan yet"
    on_track = round(counts.get("on_track", 0))
    worst = max(("behind", "quiet"), key=lambda key: counts.get(key, 0))
    if not counts.get(worst):
        return f"All {total:,} learners are on track or finished"
    tail = f"{round(counts[worst]):,} {'are behind' if worst == 'behind' else 'have gone quiet'}" if counts[worst] != 1 else f"1 {'is behind' if worst == 'behind' else 'has gone quiet'}"
    return f"{on_track:,} of {total:,} learners are on track; {tail}"


def cross(measure: Measure, cells: list[dict]) -> str:
    enough = [cell for cell in cells if cell.get("v") is not None and (measure.kind not in ("rate", "median") or cell.get("n", 0) >= MIN_N)]
    if not enough:
        return f"Too few to say yet for {measure.label.lower()}"
    best = (min if measure.direction == "down" else max)(enough, key=lambda cell: cell["v"])
    return f"{best['row_label']} on {best['col_label']} {'is quickest' if measure.direction == 'down' else 'leads'} ({fmt(measure, best['v'])})"
