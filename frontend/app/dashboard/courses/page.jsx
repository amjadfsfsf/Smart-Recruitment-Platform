"use client";

import { useEffect, useState } from "react";

import SectionHeader from "@/components/SectionHeader";
import { Button, Card, EmptyState, Field, PageShell, Tag } from "@/components/ui/DashboardUI";
import { getCourseRecommendations, getCurrentUser } from "@/lib/api";
import { getToken } from "@/lib/auth";

export default function CoursesPage() {
  const [skillsInput, setSkillsInput] = useState("");
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCourses = async (skillsCsv) => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      const response = await getCourseRecommendations(token, skillsCsv);
      setCourses(response.courses || []);
    } catch (courseError) {
      setError(courseError.message || "Could not fetch courses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const token = getToken();
      if (!token) return;

      try {
        const me = await getCurrentUser(token);
        const csv = (me.profile.skills || []).join(", ");
        if (active) setSkillsInput(csv);
        await loadCourses(csv);
      } catch {
        if (active) setError("Could not initialize course recommendations");
      }
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await loadCourses(skillsInput);
  };

  return (
    <PageShell>
      <SectionHeader
        title="Course Recommendations"
        description="Discover courses mapped to your missing or target skills."
      />

      <form onSubmit={handleSubmit} className="dashboard-card flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:p-5">
        <Field
          value={skillsInput}
          onChange={(event) => setSkillsInput(event.target.value)}
          placeholder="Enter skills, comma-separated"
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Recommend Courses"}
        </Button>
      </form>

      {error ? <p className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}

      <section className="grid auto-rows-fr gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {courses.map((course) => (
          <Card key={`${course.title}-${course.skill_taught}`} as="article" interactive className="flex h-full flex-col gap-4 p-5">
            <div>
              <h3 className="line-clamp-2 text-base font-semibold leading-6 text-white">{course.title}</h3>
              <p className="mt-1 text-sm text-white/60">{course.platform}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Tag variant="accent">{course.skill_taught}</Tag>
            </div>
            <div className="mt-auto border-t border-white/10 pt-4">
              <Button as="a" variant="secondary" size="sm" href={course.link} target="_blank" rel="noreferrer">
                Open Course
              </Button>
            </div>
          </Card>
        ))}
      </section>

      {!courses.length && !loading && !error ? (
        <EmptyState title="No courses found" description="Try adding more target skills or refreshing your recommendations." />
      ) : null}
    </PageShell>
  );
}
