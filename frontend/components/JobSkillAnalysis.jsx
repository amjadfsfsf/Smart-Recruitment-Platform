"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Tag } from "@/components/ui/DashboardUI";
import { analyzeJobSkills } from "@/lib/api";
import { getToken } from "@/lib/auth";

export default function JobSkillAnalysis({
  jobTitle,
  jobDescription = "",
  jobSkills = null,
  autoLoad = false,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);

  const run = useCallback(async () => {
    if (loading) return;
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const body = {
        job_title: jobTitle,
        job_description: jobDescription,
      };
      if (Array.isArray(jobSkills) && jobSkills.length > 0) {
        body.job_skills = jobSkills;
      }
      const result = await analyzeJobSkills(token, body);
      setData(result);
    } catch (err) {
      setError(err.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [jobTitle, jobDescription, jobSkills, loading]);

  useEffect(() => {
    if (autoLoad && !hasFetched.current) {
      hasFetched.current = true;
      run();
    }
  }, [autoLoad, run]);

  if (!data && !loading && !error) {
    return (
      <Button type="button" variant="secondary" size="sm" className="mt-1 w-full" onClick={run}>
        Analyze Skills
      </Button>
    );
  }

  if (loading) {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/62">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/18 border-t-[#DC758F]" />
        Analyzing skills...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-1 rounded-xl border border-red-400/20 bg-red-500/10 p-3">
        <p className="text-xs text-red-100">{error}</p>
        <button type="button" onClick={run} className="mt-2 text-xs font-semibold text-[#F0D6DD] hover:underline">
          Retry analysis
        </button>
      </div>
    );
  }

  const { required_skills = [], missing_skills = [] } = data || {};
  const missingSet = new Set(missing_skills);

  return (
    <div className="mt-1 space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/54">Required skills</p>
        <div className="flex flex-wrap gap-1.5">
          {required_skills.map((skill) => (
            <Tag key={skill} variant={missingSet.has(skill) ? "danger" : "slate"}>{skill}</Tag>
          ))}
        </div>
      </div>

      {missing_skills.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100/80">Missing skills</p>
          <div className="flex flex-wrap gap-1.5">
            {missing_skills.map((skill) => (
              <Tag key={skill} variant="danger">{skill}</Tag>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

