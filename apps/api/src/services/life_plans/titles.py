"""Job titles in the singular, the way a person says what they are: "Barista", not "Baristas".

BLS and O*NET name occupations in the plural ("Registered Nurses", "Waiters and Waitresses",
"First-Line Supervisors of Food Preparation and Serving Workers"). Only the job nouns change: the
last word of each part before any "of", "for", "Except" or parenthesis. Parts joined by "and" whose
noun changed become "or" ("Waiter or Waitress"), since one person is one or the other.
"""
import re

# Words that end in "s" but are already singular (or have no singular) at the end of a job title.
_KEEP = {"police", "personnel", "staff", "clergy", "series", "news", "sales", "logistics", "athletics", "aerobics",
         "bus", "gas", "status", "campus", "chorus", "census", "corps", "us", "this", "his"}
_IRREGULAR = {"people": "person", "men": "man", "women": "woman", "children": "child", "fishermen": "fisherman",
              "firemen": "fireman", "chairmen": "chairman", "foremen": "foreman", "craftsmen": "craftsman"}
_STOPS = re.compile(r"(,?\s+Except\b|,?\s+Including\b|\s+of\s+|\s+for\s+|\s+\()")
_PARTS = re.compile(r"(,\s+and\s+|,\s+or\s+|\s+and\s+|\s+or\s+|,\s+|/)")


def _word(w: str) -> str:
    low = w.lower()
    if low in _IRREGULAR:
        out = _IRREGULAR[low]
        return out.capitalize() if w[:1].isupper() else out
    if low.endswith("men") and len(low) > 4:
        return w[:-3] + ("man" if w[-3:].islower() else "MAN")
    if len(low) < 4 or low in _KEEP or not low.endswith("s") or low.endswith(("ss", "us", "is", "'s")):
        return w
    if low.endswith("ies"):
        return w[:-3] + "y"
    if low.endswith(("sses", "ches", "shes", "xes", "zes")):
        return w[:-2]
    return w[:-1]


def singular_title(title: str | None) -> str:
    """The singular of an occupation title; a title that is already singular comes back as it was."""
    t = (title or "").strip()
    if not t:
        return t
    m = _STOPS.search(t)
    head, tail = (t[:m.start()], t[m.start():]) if m else (t, "")
    bits = _PARTS.split(head)
    changed = False
    out: list[str] = []
    for i, bit in enumerate(bits):
        if i % 2 == 1:  # a separator
            if changed and bit.strip() in ("and", ", and"):
                bit = bit.replace("and", "or")
            out.append(bit)
            continue
        words = bit.split(" ")
        last = _word(words[-1]) if words and words[-1] else (words[-1] if words else "")
        changed = bool(words) and last != words[-1]
        if words:
            words[-1] = last
        out.append(" ".join(words))
    return "".join(out) + tail
