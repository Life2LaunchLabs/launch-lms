import json
import math
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlmodel import Session, SQLModel, create_engine

from src.db.organizations import Organization
from src.db.resources import (
    Resource,
    ResourceChannel,
    ResourceChannelResource,
    ResourceSearchDocument as PersistentResourceSearchDocument,
    ResourceTag,
    ResourceTagLink,
)
from src.services import resources as resource_service
from src.services.search.resource_lexical import (
    RESOURCE_SEARCH_VERSION,
    ResourceSearchDocument,
    fuse_resource_rankings,
    lexical_terms,
    rank_resource_documents,
)
from src.services.search.resource_search import query_fingerprint, refresh_resource_search_document, semantic_resource_ids


@pytest.fixture
def relevance_documents():
    fixture = json.loads((Path(__file__).parent / "fixtures/resource_search_relevance.json").read_text())
    return [ResourceSearchDocument(**{**resource, "tags": tuple(resource["tags"])}) for resource in fixture["resources"]]


def test_committed_relevance_set_establishes_measured_lexical_baseline(relevance_documents):
    fixture = json.loads((Path(__file__).parent / "fixtures/resource_search_relevance.json").read_text())
    reciprocal_ranks = []
    recall_at_ten = []
    ndcg_at_ten = []
    for judgment in fixture["judgments"]:
        ranked = rank_resource_documents(relevance_documents, judgment["query"])
        ranked_keys = [result.document.key for result in ranked]
        relevant = set(judgment["relevant"])
        first_relevant_rank = next((index for index, key in enumerate(ranked_keys, start=1) if key in relevant), None)
        reciprocal_ranks.append(1 / first_relevant_rank if first_relevant_rank else 0)
        recall_at_ten.append(len(relevant.intersection(ranked_keys[:10])) / len(relevant))
        gains = [1 / math.log2(rank + 1) for rank, key in enumerate(ranked_keys[:10], start=1) if key in relevant]
        ideal = [1 / math.log2(rank + 1) for rank in range(1, min(len(relevant), 10) + 1)]
        ndcg_at_ten.append(sum(gains) / sum(ideal))

    assert sum(reciprocal_ranks) / len(reciprocal_ranks) == pytest.approx(7 / 9)
    assert sum(recall_at_ten) / len(recall_at_ten) == pytest.approx(7 / 9)
    assert sum(ndcg_at_ten) / len(ndcg_at_ten) == pytest.approx(7 / 9)


def test_weighted_fields_prefer_title_over_description():
    documents = [
        ResourceSearchDocument(key="description", title="General planning", description="resume"),
        ResourceSearchDocument(key="title", title="Resume planning"),
    ]
    assert [item.document.key for item in rank_resource_documents(documents, "resume")] == ["title", "description"]


def test_partial_fallback_does_not_invent_concept_matches(relevance_documents):
    ranked = rank_resource_documents(relevance_documents, "personality salary quiz")
    assert ranked[0].document.key == "mbti"
    assert ranked[0].matched_terms == 1
    assert ranked[0].total_terms == 3
    assert ranked[0].match_quality == "partial"


def test_normalization_handles_accents_and_word_forms_without_concept_aliases():
    assert lexical_terms("Résumé quizzes", remove_stop_words=True) == ["resume", "quiz"]
    assert lexical_terms("Myers-Briggs and financial aid", remove_stop_words=True) == ["myer", "brigg", "financial", "aid"]
    assert lexical_terms("studies planning running", remove_stop_words=True) == ["study", "plan", "run"]
    assert RESOURCE_SEARCH_VERSION == "lexical-v2"


def test_reciprocal_rank_fusion_can_promote_a_semantic_only_candidate(relevance_documents):
    lexical = rank_resource_documents(relevance_documents, "personality")
    by_key = {document.key: document for document in relevance_documents}
    fused = fuse_resource_rankings(lexical, ["fafsa", "mbti"], by_key)

    assert [result.document.key for result in fused[:2]] == ["mbti", "fafsa"]
    assert fused[0].match_quality == "hybrid"
    assert fused[1].match_quality == "semantic"


def test_query_fingerprint_is_stable_private_and_secret_scoped():
    first = query_fingerprint("  Personality   Quiz ", "first-secret")
    assert first == query_fingerprint("personality quiz", "first-secret")
    assert first != query_fingerprint("personality quiz", "second-secret")
    assert "personality" not in first


@pytest.mark.asyncio
async def test_semantic_search_is_a_hard_lexical_fallback_on_sqlite(monkeypatch):
    monkeypatch.setenv("LAUNCHLMS_RESOURCE_VECTOR_SEARCH_ENABLED", "true")
    engine = create_engine("sqlite:///:memory:")
    with Session(engine) as db:
        assert await semantic_resource_ids("personality", [1], db) == []


@pytest.mark.asyncio
async def test_resource_service_ranks_only_visible_candidates_before_pagination(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, Resource.__table__, ResourceChannel.__table__, ResourceChannelResource.__table__,
        ResourceTag.__table__, ResourceTagLink.__table__,
        PersistentResourceSearchDocument.__table__,
    ])
    with Session(engine) as db:
        db.add(Organization(id=1, org_uuid="org-1", name="Test", slug="test", email="test@example.com"))
        visible = Resource(id=1, org_id=1, resource_uuid="visible", title="Myers-Briggs Personality Assessment", resource_type="assessment", external_url="https://example.com/visible", creation_date="2", update_date="2")
        fallback = Resource(id=2, org_id=1, resource_uuid="fallback", title="Personality strengths guide", resource_type="guide", external_url="https://example.com/fallback", creation_date="1", update_date="1")
        hidden_exact = Resource(id=3, org_id=1, resource_uuid="hidden", title="Personality quiz", resource_type="assessment", external_url="https://example.com/hidden", creation_date="3", update_date="3")
        public_channel = ResourceChannel(id=1, org_id=1, channel_uuid="public", name="Public", public=True)
        private_channel = ResourceChannel(id=2, org_id=1, channel_uuid="private", name="Private", public=False)
        db.add_all([visible, fallback, hidden_exact, public_channel, private_channel])
        db.add_all([
            ResourceChannelResource(channel_id=1, resource_id=1),
            ResourceChannelResource(channel_id=1, resource_id=2),
            ResourceChannelResource(channel_id=2, resource_id=3),
        ])
        db.commit()

        monkeypatch.setattr(resource_service, "_channel_is_accessible", lambda channel, *_args: channel.public)
        monkeypatch.setattr(resource_service, "_serialize_resource", lambda resource, *_args: {"resource_uuid": resource.resource_uuid})
        results = await resource_service.list_resources(
            SimpleNamespace(), 1, SimpleNamespace(id=7), db,
            query="personality quiz", offset=0, limit=1,
        )

    assert len(results) == 1
    assert results[0]["resource_uuid"] == "visible"
    assert results[0]["search_version"] == "lexical-v2"
    assert results[0]["search_rank"] == 1
    assert results[0]["search_score"] > 0
    assert results[0]["search_match_quality"] == "partial"


def test_resource_edit_refreshes_only_its_document_and_invalidates_embedding():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, Resource.__table__, ResourceTag.__table__, ResourceTagLink.__table__,
        PersistentResourceSearchDocument.__table__,
    ])
    with Session(engine) as db:
        db.add(Organization(id=1, org_uuid="org-1", name="Test", slug="test", email="test@example.com"))
        resource = Resource(id=1, org_id=1, resource_uuid="one", title="Quiz", resource_type="assessment", external_url="https://example.com", creation_date="1", update_date="1")
        db.add(resource)
        db.commit()
        first = refresh_resource_search_document(resource, db)
        first_hash = first.content_hash
        first.embedding = [0.0] * 384
        first.embedding_model = "test-model"
        first.embedding_version = "test-v1"
        db.add(first)
        db.commit()

        resource.title = "Updated assessment"
        db.add(resource)
        db.commit()
        refreshed = refresh_resource_search_document(resource, db)

        assert refreshed.content_hash != first_hash
        assert refreshed.title == "Updated assessment"
        assert refreshed.embedding is None
        assert refreshed.embedding_model is None
        assert refreshed.embedding_version is None
