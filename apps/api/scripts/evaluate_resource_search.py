#!/usr/bin/env python3
"""Evaluate lexical and local-semantic resource ranking on committed judgments."""

import argparse
import asyncio
import json
import math
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from src.services.search.resource_lexical import (  # noqa: E402
    ResourceSearchDocument,
    fuse_resource_rankings,
    rank_resource_documents,
)
from src.services.search.resource_search import _embed_texts, embedding_model, semantic_max_distance  # noqa: E402


def _metrics(rankings: list[list[str]], judgments: list[dict]) -> dict[str, float]:
    reciprocal_ranks = []
    recalls = []
    ndcgs = []
    for ranked_keys, judgment in zip(rankings, judgments, strict=True):
        relevant = set(judgment["relevant"])
        first = next((rank for rank, key in enumerate(ranked_keys, start=1) if key in relevant), None)
        reciprocal_ranks.append(1 / first if first else 0)
        top_ten = ranked_keys[:10]
        recalls.append(len(relevant.intersection(top_ten)) / len(relevant))
        dcg = sum(1 / math.log2(rank + 1) for rank, key in enumerate(top_ten, start=1) if key in relevant)
        ideal = sum(1 / math.log2(rank + 1) for rank in range(1, min(len(relevant), 10) + 1))
        ndcgs.append(dcg / ideal)
    count = len(judgments)
    return {
        "mrr": round(sum(reciprocal_ranks) / count, 4),
        "recall_at_10": round(sum(recalls) / count, 4),
        "ndcg_at_10": round(sum(ndcgs) / count, 4),
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-improvement", action="store_true")
    args = parser.parse_args()
    fixture_path = API_DIR / "src" / "tests" / "fixtures" / "resource_search_relevance.json"
    fixture = json.loads(fixture_path.read_text())
    documents = [
        ResourceSearchDocument(**{**resource, "tags": tuple(resource["tags"])})
        for resource in fixture["resources"]
    ]
    judgments = fixture["judgments"]
    lexical_results = [rank_resource_documents(documents, item["query"]) for item in judgments]
    lexical_rankings = [[result.document.key for result in results] for results in lexical_results]

    document_texts = [
        "\n".join((document.title, " ".join(document.tags), document.resource_type, document.provider, document.description))
        for document in documents
    ]
    document_vectors = await _embed_texts(document_texts, embedding_model())
    query_vectors = await _embed_texts([item["query"] for item in judgments], embedding_model())
    document_map = {document.key: document for document in documents}
    hybrid_rankings = []
    for lexical, query_vector in zip(lexical_results, query_vectors, strict=True):
        semantic = sorted(
            (
                (document, sum(left * right for left, right in zip(query_vector, vector, strict=True)))
                for document, vector in zip(documents, document_vectors, strict=True)
            ),
            key=lambda item: -item[1],
        )
        semantic = [item for item in semantic if item[1] >= 1 - semantic_max_distance()]
        fused = fuse_resource_rankings(lexical, [document.key for document, _ in semantic], document_map)
        hybrid_rankings.append([result.document.key for result in fused])

    report = {
        "fixture_version": fixture["version"],
        "queries": len(judgments),
        "model": embedding_model(),
        "lexical": _metrics(lexical_rankings, judgments),
        "hybrid": _metrics(hybrid_rankings, judgments),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    if args.require_improvement and any(
        report["hybrid"][metric] <= report["lexical"][metric]
        for metric in ("mrr", "recall_at_10", "ndcg_at_10")
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
