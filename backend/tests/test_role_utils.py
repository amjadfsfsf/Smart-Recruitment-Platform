import json
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.data.schemas import UserRead  # noqa: E402
from app.services.gpt_service import SkillGapGptContext, _build_prompt  # noqa: E402
from app.services.role_utils import resolve_desired_job_title, sanitize_job_title  # noqa: E402


class RoleUtilsTests(unittest.TestCase):
    def test_sanitize_job_title_splits_sentences_and_caps_length(self) -> None:
        value = "Senior Data Scientist, focused on NLP and analytics. Building ML systems end to end."

        self.assertEqual(sanitize_job_title(value), "Senior Data Scientist")

    def test_resolve_desired_job_title_extracts_concise_role_from_descriptive_text(self) -> None:
        value = "I am an aspiring Data Scientist with strong foundation in Python, SQL, and ML."

        self.assertEqual(resolve_desired_job_title(value, default=""), "Data Scientist")

    def test_user_read_keeps_target_role_separate_from_desired_job_title(self) -> None:
        user = UserRead.model_validate(
            {
                "id": 1,
                "full_name": "Test User",
                "email": "test@example.com",
                "desired_job_title": None,
                "target_role": "Interested in backend developer roles building APIs",
            }
        )

        self.assertEqual(user.desired_job_title, "Backend Developer")
        self.assertEqual(user.target_role, "Interested in backend developer roles building APIs")

    def test_build_prompt_uses_previous_missing_skills_plural_field(self) -> None:
        prompt = _build_prompt(
            SkillGapGptContext(
                current_skills=["python"],
                target_role="Backend Engineer",
                previous_missing_skills={"technical": ["system design"]},
            )
        )

        payload = json.loads(prompt)
        self.assertEqual(payload["previous_missing_skills"], {"technical": ["system design"]})


if __name__ == "__main__":
    unittest.main()
