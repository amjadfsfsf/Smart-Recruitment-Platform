import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.data import models as m  # noqa: E402
from app.data.database import Base  # noqa: E402
from app.services.gpt_service import SkillGapGptResult  # noqa: E402
from app.services.skill_gap_service import (  # noqa: E402
    _build_critical_state_key,
    analyze_skill_gap_for_user,
    analyze_skill_gap_with_gpt,
    compute_skill_gap,
    get_latest_skill_gap_for_user,
)


class SkillGapHybridFlowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        self.SessionLocal = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
        Base.metadata.create_all(self.engine)
        self.db = self.SessionLocal()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _create_user(
        self,
        *,
        desired_job_title: str = "Data Scientist",
        target_role: str = "Data Scientist",
        skills: list[str] | None = None,
    ) -> m.User:
        user = m.User(
            full_name="Test User",
            email="test@example.com",
            password_hash="hashed",
            education_level="Bachelor",
            field_of_study="Computer Science",
            experience_level="Mid-level",
            desired_job_title=desired_job_title,
            target_role=target_role,
            preferred_language="en",
        )
        self.db.add(user)
        self.db.flush()

        for skill_name in skills or []:
            self.db.add(m.UserSkill(user_id=user.id, skill_name=skill_name))

        self.db.commit()
        self.db.refresh(user)
        return user

    def test_compute_skill_gap_uses_normalization_canonical_mapping_and_fuzzy_matching(self) -> None:
        result = compute_skill_gap(
            {
                "high": ["TensorFlow", "Machine Learning Frameworks", "Docker"],
                "medium": ["AWS", "SQL", "MySQL"],
                "low": ["Problem-Solving", "teamwork"],
            },
            [
                "ML Frameworks",
                "containerization with docker",
                "Cloud Platforms",
                "databases",
                "problem solving",
                "Collaboration",
            ],
        )

        self.assertEqual(
            result["required_skills"],
            ["tensorflow", "docker", "aws", "sql", "problem solving", "teamwork"],
        )
        self.assertEqual(
            result["normalized_user_skills"],
            ["ml frameworks", "containerization", "cloud platforms", "databases", "problem solving", "collaboration"],
        )
        self.assertEqual(
            result["normalized_required"],
            ["ml frameworks", "containerization", "aws", "databases", "problem solving", "collaboration"],
        )
        self.assertEqual(
            result["normalized_required_skills"],
            ["ml frameworks", "containerization", "aws", "databases", "problem solving", "collaboration"],
        )
        self.assertEqual(
            result["matched_skills"],
            ["tensorflow", "docker", "aws", "sql", "problem solving", "teamwork"],
        )
        self.assertEqual(result["missing_skills"], [])
        self.assertEqual(
            result["categorized"],
            {
                "high": [],
                "medium": [],
                "low": [],
            },
        )
        self.assertEqual(result["score"], 100.0)

    def test_compute_skill_gap_splits_combined_cloud_skill_and_counts_distinct_providers(self) -> None:
        result = compute_skill_gap(
            {
                "high": ["cloud platforms awsgcpazure"],
            },
            ["AWS", "GCP"],
        )

        self.assertEqual(result["required_skills"], ["aws", "gcp", "azure"])
        self.assertEqual(result["normalized_required"], ["aws", "gcp", "azure"])
        self.assertEqual(result["normalized_required_skills"], ["aws", "gcp", "azure"])
        self.assertEqual(result["matched_skills"], ["aws", "gcp"])
        self.assertEqual(result["missing_skills"], ["azure"])
        self.assertEqual(
            result["categorized"],
            {
                "high": ["azure"],
                "medium": [],
                "low": [],
            },
        )
        self.assertEqual(result["score"], 66.67)

    def test_compute_skill_gap_does_not_mark_equivalent_cloud_skill_as_missing(self) -> None:
        result = compute_skill_gap(
            {
                "high": ["AWS"],
            },
            ["cloud platforms"],
        )

        self.assertEqual(result["matched_skills"], ["aws"])
        self.assertEqual(result["missing_skills"], [])
        self.assertEqual(result["score"], 100.0)

    async def test_analyze_skill_gap_for_user_calls_gpt_for_new_role_snapshot(self) -> None:
        user = self._create_user(skills=["Python"])
        payload = {
            "education": "Bachelor",
            "field": "Computer Science",
            "skills": ["PyTorch", "containerization with docker"],
            "desired_job_title": "Data Scientist",
            "target_role": "Data Scientist",
            "experience": "Mid-level",
        }
        gpt_result = SkillGapGptResult(
            role_required_skills={
                "technical": ["TensorFlow", "Machine Learning Frameworks"],
                "tools": ["Docker", "AWS"],
                "soft": ["Communication"],
            },
            skill_priority={
                "high": ["Machine Learning Frameworks", "Docker"],
                "medium": ["Cloud Platforms"],
                "low": ["Communication"],
            },
            analysis_summary="Role benchmark",
        )

        with patch(
            "app.services.skill_gap_service.analyze_skill_gap_with_progressive_gpt",
            new=AsyncMock(return_value=gpt_result),
        ) as mocked_gpt:
            result = await analyze_skill_gap_for_user(
                self.db,
                user=user,
                payload=payload,
            )

        mocked_gpt.assert_awaited_once()
        self.assertEqual(result["source"], "gpt")
        self.assertEqual(
            result["required_skills"],
            ["machine learning frameworks", "docker", "aws", "communication"],
        )
        self.assertEqual(
            result["normalized_user_skills"],
            ["ml frameworks", "containerization"],
        )
        self.assertEqual(
            result["normalized_required"],
            ["ml frameworks", "containerization", "aws", "communication"],
        )
        self.assertEqual(
            result["normalized_required_skills"],
            ["ml frameworks", "containerization", "aws", "communication"],
        )
        self.assertEqual(result["missing_skills"], ["aws", "communication"])
        self.assertEqual(result["skill_gap"], ["aws", "communication"])
        self.assertEqual(result["matched_skills"], ["machine learning frameworks", "docker"])
        self.assertEqual(result["score"], 50.0)
        self.assertEqual(
            result["required_skills_by_level"],
            {
                "HIGH": ["machine learning frameworks", "docker"],
                "MEDIUM": ["aws"],
                "LOW": ["communication"],
            },
        )
        self.assertEqual(result["skills_snapshot"], ["pytorch", "containerization with docker"])

        history = self.db.query(m.SkillGapHistory).one()
        self.assertEqual(
            history.required_skills,
            ["machine learning frameworks", "docker", "aws", "communication"],
        )
        self.assertEqual(
            history.required_skill_priority,
            {
                "high": ["machine learning frameworks", "docker"],
                "medium": ["aws"],
                "low": ["communication"],
            },
        )

    async def test_analyze_skill_gap_for_user_reuses_saved_required_skills_when_only_skills_change(self) -> None:
        user = self._create_user(skills=["Python"])
        history = m.SkillGapHistory(
            user_id=user.id,
            job_title="Data Scientist",
            critical_state_key=_build_critical_state_key(
                education="Bachelor",
                experience="Mid-level",
                desired_job_title="Data Scientist",
                target_role="Data Scientist",
            ),
            match_score=33.33,
            previous_match_score=None,
            required_skills=["machine learning frameworks", "cloud platforms", "communication"],
            required_skill_priority={
                "high": ["machine learning frameworks"],
                "medium": ["cloud platforms"],
                "low": ["communication"],
            },
            missing_skills={
                "technical": [],
                "tools": ["cloud platforms"],
                "soft": ["communication"],
            },
            skill_priority={
                "high": [],
                "medium": ["cloud platforms"],
                "low": ["communication"],
            },
            improvement_detected=False,
            improvement_reason="",
            newly_acquired_skills=[],
            still_missing_skills=["cloud platforms", "communication"],
            user_skills_snapshot=["pytorch"],
        )
        self.db.add(history)
        self.db.commit()

        payload = {
            "education": "Bachelor",
            "field": "Computer Science",
            "skills": ["PyTorch", "Amazon Web Services"],
            "desired_job_title": "Data Scientist",
            "target_role": "Data Scientist",
            "experience": "Mid-level",
        }

        with patch(
            "app.services.skill_gap_service.analyze_skill_gap_with_progressive_gpt",
            new=AsyncMock(),
        ) as mocked_gpt:
            result = await analyze_skill_gap_for_user(
                self.db,
                user=user,
                payload=payload,
            )

        mocked_gpt.assert_not_awaited()
        self.assertEqual(result["source"], "database")
        self.assertEqual(
            result["required_skills"],
            ["machine learning frameworks", "cloud platforms", "communication"],
        )
        self.assertEqual(
            result["normalized_user_skills"],
            ["ml frameworks", "aws"],
        )
        self.assertEqual(
            result["normalized_required"],
            ["ml frameworks", "cloud platforms", "communication"],
        )
        self.assertEqual(
            result["normalized_required_skills"],
            ["ml frameworks", "cloud platforms", "communication"],
        )
        self.assertEqual(result["missing_skills"], ["communication"])
        self.assertEqual(result["matched_skills"], ["machine learning frameworks", "cloud platforms"])
        self.assertEqual(result["newly_added_skills_detected"], ["cloud platforms"])
        self.assertEqual(result["score"], 66.67)
        self.assertEqual(
            result["missing_by_level"],
            {
                "HIGH": [],
                "MEDIUM": [],
                "LOW": ["communication"],
            },
        )

    def test_get_latest_skill_gap_for_user_returns_saved_required_skills_and_snapshot(self) -> None:
        user = self._create_user(desired_job_title="Backend Engineer", target_role="Backend Engineer", skills=["SQL"])
        history = m.SkillGapHistory(
            user_id=user.id,
            job_title="Backend Engineer",
            critical_state_key=_build_critical_state_key(
                education="Bachelor",
                experience="Mid-level",
                desired_job_title="Backend Engineer",
                target_role="Backend Engineer",
            ),
            match_score=40.0,
            previous_match_score=None,
            required_skills=["api development", "sql", "docker", "aws"],
            required_skill_priority={
                "high": ["api development", "sql"],
                "medium": ["docker", "aws"],
                "low": [],
            },
            missing_skills={
                "technical": ["api development"],
                "tools": ["docker", "aws"],
                "soft": [],
            },
            skill_priority={
                "high": ["api development"],
                "medium": ["docker", "aws"],
                "low": [],
            },
            improvement_detected=False,
            improvement_reason="",
            newly_acquired_skills=[],
            still_missing_skills=["api development", "docker", "aws"],
            user_skills_snapshot=["sql"],
        )
        self.db.add(history)
        self.db.commit()

        result = get_latest_skill_gap_for_user(
            self.db,
            user=user,
            payload={
                "education": "Bachelor",
                "experience": "Mid-level",
                "desired_job_title": "Backend Engineer",
                "target_role": "Backend Engineer",
            },
        )

        self.assertEqual(result["source"], "database")
        self.assertEqual(result["required_skills"], ["api development", "sql", "docker", "aws"])
        self.assertEqual(result["normalized_user_skills"], ["databases"])
        self.assertEqual(
            result["normalized_required"],
            ["api development", "databases", "containerization", "aws"],
        )
        self.assertEqual(
            result["normalized_required_skills"],
            ["api development", "databases", "containerization", "aws"],
        )
        self.assertEqual(
            result["required_skills_by_level"],
            {
                "HIGH": ["api development", "sql"],
                "MEDIUM": ["docker", "aws"],
                "LOW": [],
            },
        )
        self.assertEqual(result["skills_snapshot"], ["sql"])

    async def test_legacy_wrapper_uses_gpt_required_skills_and_local_gap(self) -> None:
        gpt_result = SkillGapGptResult(
            role_required_skills={
                "technical": ["TensorFlow", "Machine Learning Frameworks"],
                "tools": ["Docker", "AWS"],
                "soft": ["Communication"],
            },
            skill_priority={
                "high": ["Machine Learning Frameworks", "Docker"],
                "medium": ["Cloud Platforms"],
                "low": ["Communication"],
            },
            analysis_summary="Frontend benchmark",
        )

        with patch(
            "app.services.skill_gap_service.analyze_skill_gap_with_progressive_gpt",
            new=AsyncMock(return_value=gpt_result),
        ):
            result = await analyze_skill_gap_with_gpt(
                {
                    "skills": ["PyTorch", "containerization with docker", "amazon web services"],
                    "desired_job_title": "Frontend Engineer",
                    "target_role": "Frontend Engineer",
                    "experience": "Mid-level",
                }
            )

        self.assertEqual(
            result["required_skills"],
            ["machine learning frameworks", "docker", "aws", "communication"],
        )
        self.assertEqual(
            result["normalized_user_skills"],
            ["ml frameworks", "containerization", "aws"],
        )
        self.assertEqual(
            result["normalized_required"],
            ["ml frameworks", "containerization", "aws", "communication"],
        )
        self.assertEqual(
            result["normalized_required_skills"],
            ["ml frameworks", "containerization", "aws", "communication"],
        )
        self.assertEqual(result["missing_skills"], ["communication"])
        self.assertEqual(
            result["matched_skills"],
            ["machine learning frameworks", "docker", "aws"],
        )
        self.assertEqual(result["match_score"], 75.0)


if __name__ == "__main__":
    unittest.main()
