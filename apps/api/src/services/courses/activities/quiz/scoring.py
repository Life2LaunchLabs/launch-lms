"""
Quiz scoring logic — pure functions, no DB access.

Activity.details shape expected by these functions:
{
  "scoring_vectors": [
    { "key": "extraversion", "label": "Extraversion",
      "type": "unidirectional",           # "unidirectional" (0–1), "bidirectional" (-1–1), or "binary" (false/true)
      "low_label": "Introvert",
      "high_label": "Extrovert" }
  ],
  "option_scores": {
    "o_abc123": { "extraversion": 0.9, "openness": 0.3 }
  },
  "category_sets": [
    {
      "key": "personality_types",
      "label": "Personality Types",
      "categories": [
        { "uuid": "c_xxx", "title": "The Visionary",
          "description": "...", "image_file_id": null,
          "scores": { "extraversion": 0.85, "openness": 0.9 } }
      ]
    }
  ]
}

Answer format (from QuizAnswerInput):
  {"type": "select", "option_uuid": "o_abc123"}
  {"type": "info"}   — info slides contribute nothing
"""

from __future__ import annotations
import math


# ── helpers ──────────────────────────────────────────────────────────────────

def _cosine_similarity(a: dict[str, float], b: dict[str, float]) -> float:
    """Cosine similarity between two score dicts sharing the same key-space."""
    keys = set(a) | set(b)
    if not keys:
        return 0.0
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in keys)
    mag_a = math.sqrt(sum(a.get(k, 0.0) ** 2 for k in keys))
    mag_b = math.sqrt(sum(b.get(k, 0.0) ** 2 for k in keys))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ── public API ────────────────────────────────────────────────────────────────

def compute_scores(
    answers: list[dict],
    option_scores: dict[str, dict[str, float]],
    vectors: list[dict],
) -> dict[str, float]:
    """
    Aggregate per-vector scores from the options the user selected.

    Returns a dict keyed by vector key, value in [0, 1] for unidirectional,
    [-1, 1] for bidirectional, or 0/1 for binary vectors.
    """
    if not vectors:
        return {}

    vector_keys = [v["key"] for v in vectors]
    vector_types = {v["key"]: v.get("type", "unidirectional") for v in vectors}
    totals: dict[str, float] = {k: 0.0 for k in vector_keys}
    select_count = 0

    for answer in answers:
        if answer.get("type") != "select":
            continue
        option_uuid = answer.get("option_uuid")
        if not option_uuid:
            continue
        scores = option_scores.get(option_uuid, {})
        for k in vector_keys:
            totals[k] += scores.get(k, 0.0)
        select_count += 1

    if select_count == 0:
        return {k: 0.0 for k in vector_keys}

    normalized: dict[str, float] = {}
    for key in vector_keys:
        avg = totals[key] / select_count
        if vector_types.get(key) == "binary":
            normalized[key] = 1.0 if avg >= 0.5 else 0.0
        else:
            normalized[key] = avg

    return normalized


def match_result_option(
    scores: dict[str, float],
    result_options: list[dict],
) -> dict | None:
    """
    Pick the result_option whose target scores are closest to the user's scores
    using cosine similarity.  Returns the option dict augmented with 'similarity'.
    """
    if not result_options:
        return None
    best: dict | None = None
    best_sim = -2.0
    for opt in result_options:
        sim = _cosine_similarity(scores, opt.get("scores", {}))
        if sim > best_sim:
            best_sim = sim
            best = {**opt, "similarity": round(sim, 4)}
    return best


def compute_result_bundle(
    scores: dict[str, float],
    vectors: list[dict],
    category_sets: list[dict],
    result_options: list[dict] | None = None,
) -> dict:
    """
    Build the full result payload that gets stored in QuizResult.result_json.

    Returns:
    {
      "scores": { "extraversion": 0.62 },
      "vectors": [ { "key": ..., "label": ..., "type": ..., ... } ],
      "category_sets": [
        {
          "key": ..., "label": ...,
          "categories": [
            { ...category fields..., "similarity": 0.95 }
          ]   # sorted descending by similarity
        }
      ]
    }
    """
    ranked_sets = []
    for cat_set in category_sets:
        ranked_cats = []
        for cat in cat_set.get("categories", []):
            sim = _cosine_similarity(scores, cat.get("scores", {}))
            ranked_cats.append({**cat, "similarity": round(sim, 4)})
        ranked_cats.sort(key=lambda c: c["similarity"], reverse=True)
        ranked_sets.append({
            "key": cat_set.get("key"),
            "label": cat_set.get("label"),
            "categories": ranked_cats,
        })

    matched = match_result_option(scores, result_options or [])

    return {
        "scores": {k: round(v, 4) for k, v in scores.items()},
        "vectors": vectors,
        "category_sets": ranked_sets,
        "matched_result": matched,
    }
