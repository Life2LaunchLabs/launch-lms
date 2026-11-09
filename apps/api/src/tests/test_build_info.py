from src.core.build_info import released

BAKED = {"commit_sha": "a" * 40, "version": "sha-" + "a" * 40, "source_branch": "claude/x", "alembic_head": "h"}


def test_an_image_deployed_as_the_merged_commit_reports_that_commit():
    out = released(BAKED, {"LAUNCHLMS_RELEASE_COMMIT_SHA": "b" * 40, "LAUNCHLMS_RELEASE_VERSION": "sha-" + "b" * 40, "LAUNCHLMS_RELEASE_SOURCE_BRANCH": "dev"})
    assert out["commit_sha"] == "b" * 40
    assert out["build_commit_sha"] == "a" * 40
    assert out["version"] == "sha-" + "b" * 40
    assert out["source_branch"] == "dev"
    assert out["alembic_head"] == "h"


def test_without_a_release_or_with_a_bad_one_the_baked_info_stands():
    assert released(BAKED, {}) == BAKED
    assert released(BAKED, {"LAUNCHLMS_RELEASE_COMMIT_SHA": "not-a-sha"}) == BAKED
    assert released(BAKED, {"LAUNCHLMS_RELEASE_COMMIT_SHA": "a" * 40}) == BAKED
