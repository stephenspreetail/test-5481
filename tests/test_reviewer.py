import json

from mr_review.reviewer import Finding, OUTPUT_SCHEMA, SEVERITIES, CATEGORIES
from mr_review.config import Config
from mr_review.diff_source import ChangeSet


def test_finding_from_dict_defaults():
    f = Finding.from_dict({"file": "x.py", "title": "t", "detail": "d"})
    assert f.file == "x.py"
    assert f.severity == "low"  # default
    assert f.suggestion is None


def test_output_schema_is_valid_json():
    # Round-trips and declares the fields the reviewer reads back.
    encoded = json.dumps(OUTPUT_SCHEMA)
    decoded = json.loads(encoded)
    assert decoded["required"] == ["summary", "verdict", "findings"]
    item = decoded["properties"]["findings"]["items"]
    assert item["properties"]["severity"]["enum"] == SEVERITIES
    assert item["properties"]["category"]["enum"] == CATEGORIES


def test_config_from_env_defaults(monkeypatch):
    monkeypatch.delenv("MR_REVIEW_MODEL", raising=False)
    cfg = Config.from_env()
    assert cfg.model == "claude-opus-4-8"
    assert cfg.effort == "high"


def test_build_user_message_truncates(monkeypatch):
    from mr_review.reviewer import Reviewer

    # Build a Reviewer without touching the network/SDK client.
    r = Reviewer.__new__(Reviewer)
    r.config = Config(max_diff_chars=50)
    change = ChangeSet(title="t", description="d", diff="x" * 200, files=["a.py"])
    msg = r._build_user_message(change)
    assert "diff truncated" in msg
    assert msg.count("x") <= 60  # roughly the cap, not the full 200
