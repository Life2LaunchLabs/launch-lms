from config.config import _as_bool


def test_env_strings_parse_as_booleans():
    assert [_as_bool(value) for value in ("false", "0", "no", "", "true", "1", "Yes")] == [False, False, False, False, True, True, True]
    assert _as_bool(None) is False and _as_bool(True) is True
