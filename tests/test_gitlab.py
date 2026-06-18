from unittest.mock import patch, MagicMock

from mr_review.diff_source import assemble_gitlab_diff
from mr_review.gitlab import post_review, _base_url
from mr_review.diff_source import ChangeSet
from mr_review.reviewer import ReviewResult, Finding


def test_assemble_gitlab_diff_synthesises_headers():
    diffs = [
        {
            "old_path": "a.py",
            "new_path": "a.py",
            "new_file": False,
            "deleted_file": False,
            "diff": "@@ -1 +1,2 @@\n line\n+added\n",
        },
        {
            "old_path": "old.py",
            "new_path": "new.py",
            "renamed_file": True,
            "new_file": False,
            "deleted_file": False,
            "diff": "@@ -1 +1 @@\n-x\n+y\n",
        },
    ]
    text, files, path_map = assemble_gitlab_diff(diffs)
    assert "diff --git a/a.py b/a.py" in text
    assert "--- a/a.py" in text and "+++ b/a.py" in text
    assert files == ["a.py", "new.py"]
    assert path_map["new.py"] == "old.py"  # rename tracked


def test_assemble_gitlab_diff_new_and_deleted_files():
    diffs = [
        {"old_path": "n.py", "new_path": "n.py", "new_file": True, "diff": "@@ -0,0 +1 @@\n+hi\n"},
        {"old_path": "d.py", "new_path": "d.py", "deleted_file": True, "diff": "@@ -1 +0,0 @@\n-bye\n"},
    ]
    text, _, _ = assemble_gitlab_diff(diffs)
    assert "--- /dev/null" in text  # new file
    assert "+++ /dev/null" in text  # deleted file


def test_base_url_encodes_project_path():
    url = _base_url("https://gitlab.com", "group/sub/name", 7)
    assert "group%2Fsub%2Fname" in url
    assert url.endswith("/merge_requests/7")


def _change():
    return ChangeSet(
        title="t",
        description="d",
        diff="diff",
        project="group/name",
        mr_iid=9,
        diff_refs={"base_sha": "b", "start_sha": "s", "head_sha": "h"},
        path_map={"a.py": "a.py"},
        files=["a.py", "b.py"],
    )


def _result():
    return ReviewResult(
        summary="s",
        verdict="comment",
        findings=[
            Finding("a.py", 10, "high", "correctness", "high", "Bug", "boom", "fix"),
            Finding("missing.py", None, "low", "style", "low", "Nit", "x", None),
        ],
    )


def test_post_review_inline_then_summary():
    with patch("mr_review.gitlab.requests.post") as mock_post:
        ok = MagicMock(ok=True, status_code=200)
        ok.json.return_value = {"id": 123}
        mock_post.return_value = ok

        post_review(_change(), _result(), token="tok")

        urls = [c.args[0] for c in mock_post.call_args_list]
        assert any(u.endswith("/discussions") for u in urls)  # inline finding
        assert any(u.endswith("/notes") for u in urls)        # summary note

        # The inline call carries a flattened diff position.
        disc_call = next(c for c in mock_post.call_args_list if c.args[0].endswith("/discussions"))
        assert disc_call.kwargs["data"]["position[new_line]"] == 10
        assert disc_call.kwargs["data"]["position[head_sha]"] == "h"


def test_post_review_falls_back_when_no_diff_refs():
    change = _change()
    change.diff_refs = None  # cannot anchor inline
    with patch("mr_review.gitlab.requests.post") as mock_post:
        ok = MagicMock(ok=True, status_code=200)
        ok.json.return_value = {"id": 1}
        mock_post.return_value = ok

        post_review(change, _result(), token="tok")

        urls = [c.args[0] for c in mock_post.call_args_list]
        assert not any(u.endswith("/discussions") for u in urls)
        note_call = next(c for c in mock_post.call_args_list if c.args[0].endswith("/notes"))
        assert "Additional findings" in note_call.kwargs["data"]["body"]
