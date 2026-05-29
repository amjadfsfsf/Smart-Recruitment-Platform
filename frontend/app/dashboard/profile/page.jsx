"use client";

import { useCallback, useEffect, useState } from "react";

import SectionHeader from "@/components/SectionHeader";
import SkillPicker from "@/components/SkillPicker";
import { Button, Card, Field, Label, PageShell } from "@/components/ui/DashboardUI";
import { addUserSkill, deleteUserSkill, getCurrentUser, searchSkills, updateProfile } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { didRoleFieldsChange, didSkillsChange, useGlobalState } from "../GlobalStateProvider";

const EDUCATION_OPTIONS = ["High School", "Diploma", "Bachelor", "Master", "PhD"];
const EXPERIENCE_OPTIONS = ["Entry-Level", "Junior", "Mid-Level", "Senior"];
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

function normalizeSkillEntries(data) {
  if (Array.isArray(data?.skill_entries) && data.skill_entries.length) {
    return data.skill_entries;
  }

  return (data?.skills || []).map((skill, index) => ({
    id: `skill-${index}-${skill}`,
    skill_name: skill,
    level: null,
  }));
}

export default function ProfilePage() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    education_level: "",
    field_of_study: "",
    experience_level: "",
    desired_job_title: "",
    target_role: "",
    preferred_language: "en",
  });
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [skillMessage, setSkillMessage] = useState("");

  const { userProfile, updateProfileData, forceRunSkillGapAnalysis, recomputeSkillGapAnalysis } = useGlobalState();

  const fetchSkillSuggestions = useCallback(async (text) => {
    try {
      return await searchSkills(text);
    } catch {
      return [];
    }
  }, []);

  const handlePersistAddSkill = useCallback(
    async (skillName) => {
      const token = getToken();
      if (!token) {
        throw new Error("User not logged in");
      }
      setSkillMessage("");
      try {
        const created = await addUserSkill(token, { skill_name: skillName });
        
        const newSkills = [...skills, created];
        setSkills(newSkills);
        
        if (userProfile) {
          const updatedProfile = { ...userProfile, skills: newSkills };
          updateProfileData(updatedProfile);
          recomputeSkillGapAnalysis(updatedProfile).catch(console.error);
        }

        setSkillMessage("Skill added. Recomputing gap...");
        return created;
      } catch (error) {
        const message = error?.message || "Could not add skill";
        setSkillMessage(message);
        throw error;
      }
    },
    [skills, userProfile, updateProfileData, recomputeSkillGapAnalysis]
  );

  const handlePersistRemoveSkill = useCallback(
    async (skill) => {
      const token = getToken();
      if (!token) {
        throw new Error("User not logged in");
      }
      setSkillMessage("");
      if (skill.id === undefined || skill.id === null) {
        return;
      }
      try {
        await deleteUserSkill(token, skill.id);
        
        const newSkills = skills.filter(s => s.id !== skill.id);
        setSkills(newSkills);
        
        if (userProfile) {
          const updatedProfile = { ...userProfile, skills: newSkills };
          updateProfileData(updatedProfile);
          recomputeSkillGapAnalysis(updatedProfile).catch(console.error);
        }

        setSkillMessage("Skill removed. Recomputing gap...");
      } catch (error) {
        const message = error?.message || "Could not remove skill";
        setSkillMessage(message);
        throw error;
      }
    },
    [skills, userProfile, updateProfileData, recomputeSkillGapAnalysis]
  );

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const token = getToken();

      const fallbackData = {
        full_name: "Demo User",
        email: "demo@smartrecruitmentplatform.ai",
        education_level: "Bachelor",
        field_of_study: "Computer Science",
        experience_level: "Entry-Level",
        desired_job_title: "Demo Role",
        target_role: "Demo Target",
        preferred_language: "en",
      };

      if (!token) {
        if (active) {
          setForm(fallbackData);
          setLoading(false);
          setMessage("You are viewing a demo profile. Please sign in to save changes.");
        }
        return;
      }

      try {
        const data = await getCurrentUser(token);
        if (!active) {
          return;
        }

        setForm({
          full_name: data.full_name || "",
          email: data.email || "",
          education_level: data.education_level || "",
          field_of_study: data.field_of_study || "",
          experience_level: data.experience_level === "Beginner" ? "Entry-Level" : data.experience_level || "",
          desired_job_title: data.desired_job_title || "",
          target_role: data.target_role || "",
          preferred_language: data.preferred_language || "en",
        });
        setSkills(normalizeSkillEntries(data));
      } catch (error) {
        if (active) {
          const isAuthError =
            error.message?.toLowerCase().includes("not authenticated") ||
            error.message?.toLowerCase().includes("unauthorized") ||
            error.status === 401;

          if (isAuthError) {
            setForm(fallbackData);
            setMessage("Session expired or not authenticated. Viewing demo profile.");
          } else {
            setMessage(error.message || "Could not load profile.");
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    const token = getToken();
    if (!token) {
      setMessage("User not logged in");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const updated = await updateProfile(token, {
        full_name: form.full_name,
        education_level: form.education_level,
        field_of_study: form.field_of_study,
        experience_level: form.experience_level,
        desired_job_title: form.desired_job_title,
        target_role: form.target_role,
        preferred_language: form.preferred_language,
      });

      setForm({
        full_name: updated.full_name || "",
        email: updated.email || "",
        education_level: updated.education_level || "",
        field_of_study: updated.field_of_study || "",
        experience_level: updated.experience_level || "",
        desired_job_title: updated.desired_job_title || "",
        target_role: updated.target_role || "",
        preferred_language: updated.preferred_language || "en",
      });
      setSkills(normalizeSkillEntries(updated));
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: updated.id,
          full_name: updated.full_name,
          email: updated.email,
          education_level: updated.education_level,
          field_of_study: updated.field_of_study,
          experience_level: updated.experience_level,
          desired_job_title: updated.desired_job_title,
          target_role: updated.target_role,
          preferred_language: updated.preferred_language,
        }),
      );

      const updatedProfileWithSkills = { ...updated, skills };
      const roleChanged = didRoleFieldsChange(userProfile, updatedProfileWithSkills);
      const onlySkillsChanged = didSkillsChange(userProfile, updatedProfileWithSkills);
      
      updateProfileData(updatedProfileWithSkills);

      if (roleChanged) {
        forceRunSkillGapAnalysis(updatedProfileWithSkills).catch(console.error);
        setMessage("Profile updated successfully. Recomputing skill gap with GPT...");
      } else if (onlySkillsChanged) {
        recomputeSkillGapAnalysis(updatedProfileWithSkills).catch(console.error);
        setMessage("Profile updated successfully. Recomputing skill gap locally...");
      } else {
        setMessage("Profile updated successfully.");
      }
    } catch (error) {
      setMessage(error.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading profile...</p>;
  }

  return (
    <PageShell>
      <SectionHeader
        title="User Profile"
        description="View your current database values and update your desired job title, target-role description, education, experience, and skills."
      />

      <Card as="form" onSubmit={handleSave} className="p-5 md:p-7">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="full_name">
              Full Name
            </Label>
            <Field
              id="full_name"
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="email">
              Email
            </Label>
            <Field
              id="email"
              value={form.email}
              readOnly
              className="bg-white/[0.045] text-white/[0.56]"
            />
          </div>

          <div>
            <Label htmlFor="education_level">
              Education
            </Label>
            <Field
              as="select"
              id="education_level"
              value={form.education_level}
              onChange={(event) => setForm({ ...form, education_level: event.target.value })}
            >
              <option value="">Select education level</option>
              {EDUCATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
          </div>

          <div>
            <Label htmlFor="experience_level">
              Experience
            </Label>
            <Field
              as="select"
              id="experience_level"
              value={form.experience_level}
              onChange={(event) => setForm({ ...form, experience_level: event.target.value })}
            >
              <option value="">Select experience level</option>
              {EXPERIENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Field>
          </div>

          <div>
            <Label htmlFor="preferred_language">
              Preferred Language
            </Label>
            <Field
              as="select"
              id="preferred_language"
              value={form.preferred_language}
              onChange={(event) => setForm({ ...form, preferred_language: event.target.value })}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Field>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="field_of_study">
              What Did You Study?
            </Label>
            <Field
              id="field_of_study"
              value={form.field_of_study}
              onChange={(event) => setForm({ ...form, field_of_study: event.target.value })}
              placeholder="Artificial Intelligence"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="desired_job_title">
              Desired Job Title
            </Label>
            <Field
              id="desired_job_title"
              required
              value={form.desired_job_title}
              onChange={(event) => setForm({ ...form, desired_job_title: event.target.value })}
              placeholder="Data Scientist"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="target_role">
              Target Role
            </Label>
            <Field
              as="textarea"
              id="target_role"
              value={form.target_role}
              onChange={(event) => setForm({ ...form, target_role: event.target.value })}
              rows={4}
              placeholder="Describe your ideal work, specialization, industries, or long-term direction."
            />
            <p className="mt-1 text-xs text-slate-500">Optional career context used to enrich recommendations and AI prompts.</p>
          </div>

          <div className="md:col-span-2">
            <SkillPicker
              label="Skills"
              helperText="Search existing skills or press Enter to add a custom one. Remove skills you no longer want listed."
              placeholder="Search or add a skill"
              selectedSkills={skills}
              onSelectedChange={setSkills}
              fetchSuggestions={fetchSkillSuggestions}
              onPersistAdd={handlePersistAddSkill}
              onPersistRemove={handlePersistRemoveSkill}
            />
            {skillMessage ? <p className="mt-2 text-sm text-slate-600">{skillMessage}</p> : null}
          </div>
        </div>

        {message ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p> : null}

        <div className="mt-5">
          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
