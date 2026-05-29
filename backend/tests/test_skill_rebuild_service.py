import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.data import models as m  # noqa: E402
from app.services.gpt_service import parse_rebuilt_skills  # noqa: E402
from app.services.skill_rebuild_service import rebuild_skill_list_for_user  # noqa: E402


class SkillRebuildServiceTests(unittest.IsolatedAsyncioTestCase):
    def _build_user(self) -> m.User:
        user = m.User(
            id=7,
            full_name="Test User",
            email="test@example.com",
            password_hash="hashed",
            education_level="Bachelor",
            field_of_study="Artificial Intelligence",
            experience_level="Entry-Level",
            desired_job_title="Data Scientist",
            target_role="Build machine learning models for product and analytics teams.",
            preferred_language="en",
        )
        user.skills = [
            m.UserSkill(id=1, user_id=7, skill_name="Python"),
            m.UserSkill(id=2, user_id=7, skill_name="SQL"),
        ]
        return user

    def test_parse_rebuilt_skills_normalizes_and_dedupes(self) -> None:
        raw_output = "1. python, SQL, machine learning,\n- Python,\n* power bi, nlp"

        self.assertEqual(
            parse_rebuilt_skills(raw_output),
            ["Python", "SQL", "Machine Learning", "Power BI", "NLP"],
        )

    async def test_rebuild_skill_list_for_user_uses_profile_fallbacks(self) -> None:
        user = self._build_user()
        mocked_result = [
            "Python",
            "SQL",
            "Machine Learning",
            "Pandas",
            "NumPy",
            "Scikit-learn",
            "Data Visualization",
            "Feature Engineering",
            "Model Evaluation",
            "Statistics",
        ]

        with patch(
            "app.services.skill_rebuild_service.rebuild_skill_list_with_gpt",
            new=AsyncMock(return_value=mocked_result),
        ) as mocked_rebuild:
            result = await rebuild_skill_list_for_user(
                user=user,
                payload={
                    "education": "",
                    "experience": "",
                    "field": "",
                    "skills": [],
                    "desired_job_title": "",
                    "target_role": "",
                },
            )

        mocked_rebuild.assert_awaited_once()
        context = mocked_rebuild.await_args.args[0]
        self.assertEqual(context.education, "Bachelor")
        self.assertEqual(context.experience_level, "Entry-Level")
        self.assertEqual(context.field_of_study, "Artificial Intelligence")
        self.assertEqual(context.current_skills, ["Python", "SQL"])
        self.assertEqual(context.desired_job_title, "Data Scientist")
        self.assertIn("machine learning models", context.target_role.lower())

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["skills"], mocked_result)
        self.assertEqual(result["skills_csv"], ", ".join(mocked_result))
        self.assertEqual(result["desired_job_title"], "Data Scientist")
        self.assertIn("machine learning models", result["target_role"].lower())


if __name__ == "__main__":
    unittest.main()
