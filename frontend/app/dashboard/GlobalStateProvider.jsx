"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getCurrentUser, requestSkillGapAnalysis, recomputeSkillGapAnalysis as apiRecomputeSkillGapAnalysis } from "@/lib/api";
import { getToken } from "@/lib/auth";

const GlobalStateContext = createContext(null);

export const useGlobalState = () => {
  const context = useContext(GlobalStateContext);
  if (!context) {
    throw new Error("useGlobalState must be used within a GlobalStateProvider");
  }
  return context;
};

function normalizeComparableValue(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeDesiredJobTitle(value) {
  return String(value || "").split(".")[0].split(",")[0].trim().slice(0, 50);
}

export function didRoleFieldsChange(prev, current) {
  if (!prev || !current) return true;

  const prevSig = {
    education: normalizeComparableValue(prev.education_level || prev.education),
    experience: normalizeComparableValue(prev.experience_level || prev.experience),
    desired_job_title: normalizeComparableValue(sanitizeDesiredJobTitle(prev.desired_job_title)),
    target_role: normalizeComparableValue(prev.target_role),
  };

  const currentSig = {
    education: normalizeComparableValue(current.education_level || current.education),
    experience: normalizeComparableValue(current.experience_level || current.experience),
    desired_job_title: normalizeComparableValue(sanitizeDesiredJobTitle(current.desired_job_title)),
    target_role: normalizeComparableValue(current.target_role),
  };

  return (
    prevSig.education !== currentSig.education ||
    prevSig.experience !== currentSig.experience ||
    prevSig.desired_job_title !== currentSig.desired_job_title ||
    prevSig.target_role !== currentSig.target_role
  );
}

export function didSkillsChange(prev, current) {
  if (!prev || !current) return false;

  const roleChanged = didRoleFieldsChange(prev, current);
  
  const getSkillsString = (profile) => {
    const skills = profile.skill_entries || profile.skills || [];
    return skills
      .map((s) => String(s.skill_name || s).toLowerCase().trim())
      .sort()
      .join(",");
  };

  const prevSkills = getSkillsString(prev);
  const currSkills = getSkillsString(current);

  return !roleChanged && prevSkills !== currSkills;
}

export function GlobalStateProvider({ children }) {
  const [userProfile, setUserProfile] = useState(null);
  const [skillGapAnalysis, setSkillGapAnalysis] = useState(null);
  const [skillGapError, setSkillGapError] = useState(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [isRefreshingSkillGap, setIsRefreshingSkillGap] = useState(false);

  const fetchProfileAndAnalysis = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoadingContext(false);
      return;
    }

    try {
      const data = await getCurrentUser(token);
      setUserProfile(data);

      const education = (data.education_level || "").trim();
      const experience = (data.experience_level || "").trim();
      const desired_job_title = sanitizeDesiredJobTitle(data.desired_job_title || "");

      // Only attempt analysis if required role fields are present
      if (education && experience && desired_job_title) {
        const analysisPayload = {
          education,
          experience,
          desired_job_title,
          field: (data.field_of_study || "").trim(),
          target_role: (data.target_role || "").trim(),
          skills: (data.skill_entries || data.skills || []).map((s) =>
            typeof s === "string" ? s : s.skill_name
          ),
        };

        try {
          const analysis = await requestSkillGapAnalysis(analysisPayload, token);
          setSkillGapAnalysis(analysis);
          setSkillGapError(null);
        } catch (e) {
          console.error("Could not load skill gap analysis on mount:", e);
          setSkillGapError(e?.message || "Failed to load skill gap analysis.");
          setSkillGapAnalysis(null);
        }
      }
    } catch (error) {
      console.error("Could not load global profile", error);
    } finally {
      setLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileAndAnalysis();
  }, [fetchProfileAndAnalysis]);

  const updateProfileData = (newProfile) => {
    setUserProfile(newProfile);
  };

  const forceRunSkillGapAnalysis = async (profileData) => {
    const token = getToken();
    if (!token) return null;

    const payload = {
      education: (profileData.education_level || profileData.education || "").trim(),
      field: (profileData.field_of_study || profileData.field || "").trim(),
      experience: (profileData.experience_level || profileData.experience || "").trim(),
      skills: (profileData.skill_entries || profileData.skills || []).map((s) =>
        typeof s === "string" ? s : s.skill_name
      ),
      desired_job_title: sanitizeDesiredJobTitle(profileData.desired_job_title || ""),
      target_role: (profileData.target_role || "").trim(),
    };

    if (!payload.education || !payload.experience || !payload.desired_job_title) {
      console.warn("Missing required profile fields. Skipping skill gap analysis.");
      return null;
    }

    setIsRefreshingSkillGap(true);
    setSkillGapError(null);
    try {
      const result = await requestSkillGapAnalysis(payload, token);
      setSkillGapAnalysis(result);
      return result;
    } catch (error) {
      console.error("Error refreshing skill gap:", error);
      setSkillGapError(error?.message || "Failed to analyze skill gap.");
      throw error;
    } finally {
      setIsRefreshingSkillGap(false);
    }
  };

  const recomputeSkillGapAnalysis = async (profileData) => {
    const token = getToken();
    if (!token) return null;

    setIsRefreshingSkillGap(true);
    setSkillGapError(null);
    try {
      const payload = {
        skills: (profileData.skill_entries || profileData.skills || []).map((s) =>
          typeof s === "string" ? s : s.skill_name
        ),
      };

      const result = await apiRecomputeSkillGapAnalysis(payload, token);
      setSkillGapAnalysis(result);
      return result;
    } catch (error) {
      console.error("Error recomputing skill gap:", error);
      setSkillGapError(error?.message || "Failed to recompute skill gap.");
      throw error;
    } finally {
      setIsRefreshingSkillGap(false);
    }
  };

  return (
    <GlobalStateContext.Provider
      value={{
        userProfile,
        skillGapAnalysis,
        setSkillGapAnalysis,
        skillGapError,
        loadingContext,
        isRefreshingSkillGap,
        updateProfileData,
        forceRunSkillGapAnalysis,
        recomputeSkillGapAnalysis,
        fetchProfileAndAnalysis,
      }}
    >
      {children}
    </GlobalStateContext.Provider>
  );
}
