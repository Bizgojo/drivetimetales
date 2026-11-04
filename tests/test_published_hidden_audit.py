"""Offline regression tests: python3 -m unittest discover -s tests -p 'test_published_hidden_audit.py'"""
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "audit_published_hidden.py"
spec = importlib.util.spec_from_file_location("published_hidden_audit", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def story(id, status="audio_ready", hidden=True, **overrides):
    r = {"id": id, "title": id, "status": status, "workflow_state": "published",
         "is_hidden": hidden, "review_status": "approved", "audio_url": "mix.mp3",
         "story_audio_url": "body.mp3", "cover_url": "cover.jpg",
         "description": "description", "duration_mins": 17, "author": "author",
         "genre": "mystery", "published_on": None, "updated_at": "now", "version": 1}
    r.update(overrides)
    return r

class AuditTests(unittest.TestCase):
    def test_four_classifications_never_publish(self):
        rows = [story("a"), story("b", status="pending", audio_url=None),
                story("c", status="validator_passed"), story("d", status="published")]
        result = module.classify(rows)
        self.assertEqual(result["affected_count"], 4)
        self.assertEqual({r["category"] for r in result["records"]},
                         {"audio_ready_gate_audit", "unfinished_no_audio",
                          "audio_proof_unverified", "published_hidden_inconsistent"})
        self.assertTrue(all(not r["eligible_to_publish"] and not r["write_plan"] for r in result["records"]))
        self.assertTrue(all(r["before"] == r["after"] == r["rollback"] for r in result["records"]))
    def test_visible_excluded_and_no_mutation(self):
        rows = [story("live", hidden=False), story("hidden")]
        original = [r.copy() for r in rows]
        report = module.classify(rows)
        self.assertEqual(rows, original)
        self.assertEqual(report["affected_count"], 1)
        self.assertEqual(report["records"][0]["id"], "hidden")
        self.assertEqual(report["writes_performed"], 0)
    def test_duplicate_ids_refused(self):
        with self.assertRaises(ValueError):
            module.classify([story("same"), story("same")])
    def test_pending_with_publication_date_is_not_released(self):
        result = module.classify([story("x", status="pending", audio_url=None,
                                        published_on="2026-01-16", review_status="pending")])
        record = result["records"][0]
        self.assertIn("historical published_on conflicts with pending status", record["blockers"])
        self.assertFalse(record["eligible_to_publish"])
    def test_report_deterministic_and_series_incomplete_blocked(self):
        rows = [story("a", series_id="s", episode_number=1),
                story("c", series_id="s", episode_number=3)]
        first = module.classify(rows)
        self.assertEqual(first, module.classify(list(reversed(rows))))
        self.assertTrue(any("gaps" in b for b in first["records"][0]["blockers"]))
if __name__ == "__main__":
    unittest.main()
