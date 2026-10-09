"""Deterministic lexical ranking for permission-filtered resource discovery."""

from dataclasses import dataclass
import re
import unicodedata


RESOURCE_SEARCH_VERSION = "lexical-v2"
HYBRID_SEARCH_VERSION = "hybrid-v1"

_STOP_WORDS = {
    "a", "an", "and", "about", "browse", "find", "for", "look", "me", "of",
    "on", "please", "resource", "resources", "search", "show", "some", "the",
    "to", "with",
}

_FIELD_WEIGHTS = {"title": 8.0, "tags": 6.0, "resource_type": 5.0, "provider": 4.0, "description": 2.0}
_IRREGULAR_LEMMAS = {
    "children": "child",
    "feet": "foot",
    "mice": "mouse",
    "people": "person",
    "quizzes": "quiz",
    "teeth": "tooth",
}


@dataclass(frozen=True)
class ResourceSearchDocument:
    key: str
    title: str
    description: str = ""
    provider: str = ""
    resource_type: str = ""
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class RankedResource:
    document: ResourceSearchDocument
    score: float
    matched_terms: int
    total_terms: int
    match_quality: str


def _lemmatize(token: str) -> str:
    """Small deterministic English lemmatizer with no runtime corpus download."""
    if token in _IRREGULAR_LEMMAS:
        return _IRREGULAR_LEMMAS[token]
    if token.endswith("ies") and len(token) > 4:
        return f"{token[:-3]}y"
    if token.endswith(("ches", "shes", "xes", "zes")) and len(token) > 5:
        return token[:-2]
    if token.endswith("ing") and len(token) > 5:
        lemma = token[:-3]
        return lemma[:-1] if len(lemma) > 2 and lemma[-1] == lemma[-2] else lemma
    if token.endswith("ed") and len(token) > 4:
        lemma = token[:-2]
        return lemma[:-1] if len(lemma) > 2 and lemma[-1] == lemma[-2] else lemma
    if token.endswith("s") and not token.endswith(("ss", "us", "is")) and len(token) > 3:
        return token[:-1]
    return token


def lexical_terms(value: str, *, remove_stop_words: bool = False) -> list[str]:
    ascii_value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    normalized_value = re.sub(r"[^a-z0-9]+", " ", ascii_value.lower())
    raw_terms = re.findall(r"[a-z0-9]+", normalized_value)
    terms = [_lemmatize(term) for term in raw_terms]
    if remove_stop_words:
        terms = [term for term in terms if term not in _STOP_WORDS]
    return list(dict.fromkeys(terms))


def _term_similarity(query_term: str, candidate: str) -> float:
    if query_term == candidate:
        return 1.0
    shorter = min(len(query_term), len(candidate))
    if shorter >= 3 and (query_term.startswith(candidate) or candidate.startswith(query_term)):
        return 0.82
    if shorter < 4:
        return 0.0
    max_distance = 1 if max(len(query_term), len(candidate)) < 8 else 2
    if abs(len(query_term) - len(candidate)) > max_distance:
        return 0.0
    previous = list(range(len(candidate) + 1))
    for row_index, query_character in enumerate(query_term, start=1):
        current = [row_index]
        for column_index, candidate_character in enumerate(candidate, start=1):
            current.append(min(
                current[-1] + 1,
                previous[column_index] + 1,
                previous[column_index - 1] + (query_character != candidate_character),
            ))
        if min(current) > max_distance:
            return 0.0
        previous = current
    return 0.72 if previous[-1] <= max_distance else 0.0


def _field_match(query_term: str, candidates: list[str]) -> float:
    return max((_term_similarity(query_term, candidate) for candidate in candidates), default=0.0)


def rank_resource_documents(documents: list[ResourceSearchDocument], query: str) -> list[RankedResource]:
    query_terms = lexical_terms(query, remove_stop_words=True)
    if not query_terms:
        return [RankedResource(document, 0.0, 0, 0, "browse") for document in documents]

    ranked: list[tuple[RankedResource, int]] = []
    for index, document in enumerate(documents):
        fields = {
            "title": lexical_terms(document.title),
            "tags": lexical_terms(" ".join(document.tags)),
            "resource_type": lexical_terms(document.resource_type),
            "provider": lexical_terms(document.provider),
            "description": lexical_terms(document.description),
        }
        matched_terms = 0
        score = 0.0
        used_fuzzy_match = False
        for query_term in query_terms:
            field_scores = [(_field_match(query_term, candidates), _FIELD_WEIGHTS[field]) for field, candidates in fields.items()]
            similarity, weight = max(field_scores, key=lambda item: item[0] * item[1])
            if similarity:
                matched_terms += 1
                score += similarity * weight
                used_fuzzy_match = used_fuzzy_match or similarity < 1.0

        if matched_terms == 0:
            continue
        coverage = matched_terms / len(query_terms)
        score *= coverage * coverage
        normalized_query = " ".join(query_terms)
        if normalized_query and normalized_query in " ".join(fields["title"]):
            score += 6.0
        match_quality = "partial" if coverage < 1 else "fuzzy" if used_fuzzy_match else "all_terms"
        ranked.append((RankedResource(
            document=document,
            score=round(score, 4),
            matched_terms=matched_terms,
            total_terms=len(query_terms),
            match_quality=match_quality,
        ), index))

    ranked.sort(key=lambda item: (-item[0].matched_terms / item[0].total_terms, -item[0].score, item[1]))
    return [item[0] for item in ranked]


def fuse_resource_rankings(
    lexical: list[RankedResource],
    semantic_keys: list[str],
    documents_by_key: dict[str, ResourceSearchDocument],
    *,
    rank_constant: int = 60,
) -> list[RankedResource]:
    """Fuse independently ranked candidates using reciprocal-rank fusion."""
    lexical_by_key = {item.document.key: item for item in lexical}
    scores: dict[str, float] = {}
    for rank, result in enumerate(lexical, start=1):
        scores[result.document.key] = scores.get(result.document.key, 0.0) + 1 / (rank_constant + rank)
    for rank, key in enumerate(semantic_keys, start=1):
        if key in documents_by_key:
            scores[key] = scores.get(key, 0.0) + 1 / (rank_constant + rank)

    semantic_set = set(semantic_keys)
    ranked_keys = sorted(scores, key=lambda key: (-scores[key], key))
    results = []
    for key in ranked_keys:
        lexical_result = lexical_by_key.get(key)
        results.append(RankedResource(
            document=documents_by_key[key],
            score=round(scores[key] * 1_000, 4),
            matched_terms=lexical_result.matched_terms if lexical_result else 0,
            total_terms=lexical_result.total_terms if lexical_result else 0,
            match_quality=(
                "hybrid" if lexical_result and key in semantic_set
                else "semantic" if key in semantic_set
                else lexical_result.match_quality
            ),
        ))
    return results
