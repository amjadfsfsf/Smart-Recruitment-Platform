"use client";

import { useEffect, useState } from "react";

import SectionHeader from "@/components/SectionHeader";
import { getCareerPath, getCurrentUser } from "@/lib/api";
import { getToken } from "@/lib/auth";

function parseSkills(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function CareerPathPage() {
  const [targetJob, setTargetJob] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [pathData, setPathData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const token = getToken();
      if (!token) {
        return;
      }

      try {
        const me = await getCurrentUser(token);
        if (active) {
          setTargetJob(me.desired_job_title || me.profile.target_career || "Data Scientist");
          setSkillsInput((me.profile.skills || []).join(", "));
        }
      } catch {
        if (active) {
          setTargetJob("Data Scientist");
        }
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const generatePath = async (event) => {
    event.preventDefault();
    const token = getToken();
    if (!token) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await getCareerPath(token, {
        target_job: targetJob,
        current_skills: parseSkills(skillsInput),
      });
      setPathData(response);
    } catch (generationError) {
      setError(generationError.message || "Could not generate career path");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Smart Recruitment Platform Roadmap"
        description="Generate a step-by-step plan including skills, intermediate roles, and milestones."
      />

      <form onSubmit={generatePath} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="targetJob" className="mb-1 block text-sm font-medium text-slate-700">
              Target Job
            </label>
            <input
              id="targetJob"
              value={targetJob}
              onChange={(event) => setTargetJob(event.target.value)}
              placeholder="Data Scientist"
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label htmlFor="skillsInput" className="mb-1 block text-sm font-medium text-slate-700">
              Current Skills
            </label>
            <input
              id="skillsInput"
              value={skillsInput}
              onChange={(event) => setSkillsInput(event.target.value)}
              placeholder="Python, SQL, Communication"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Generating roadmap..." : "Generate Smart Recruitment Platform Roadmap"}
        </button>
      </form>

      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

      {pathData ? (
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slateplus">Skills to Learn</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {pathData.skills_to_learn.map((skill) => (
                <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {skill}
                </span>
              ))}
              {!pathData.skills_to_learn.length ? (
                <span className="text-sm text-slate-500">No critical gaps detected.</span>
              ) : null}
            </div>

            <h3 className="mt-6 text-base font-semibold text-slateplus">Intermediate Roles</h3>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-slate-600">
              {pathData.intermediate_roles.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slateplus">Roadmap Steps</h3>
            <div className="mt-4 space-y-3">
              {pathData.roadmap.map((phase) => (
                <div key={phase.phase} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-sm font-semibold text-slateplus">{phase.phase}</p>
                  <p className="mt-1 text-sm text-slate-600">{phase.focus}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
                    {phase.action_items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
