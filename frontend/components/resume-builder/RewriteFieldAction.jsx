"use client";

import { useEffect, useRef, useState } from "react";

import { rewriteText } from "@/lib/rewriteText";

const SUCCESS_STATE_DURATION_MS = 2200;

export default function RewriteFieldAction({
  value = "",
  onRewrite,
  successMessage = "Text rewritten successfully.",
  onSuccess,
  onError,
  label = "Rewrite",
  section = "resume",
  fieldName = "",
  fieldLabel = "",
  skills = "",
  experience = "",
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessState, setShowSuccessState] = useState(false);
  const successTimeoutRef = useRef(null);
  const hasValue = String(value || "").trim().length > 0;

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const handleRewrite = async () => {
    if (!hasValue || isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      const rewritten = await rewriteText(value, {
        section,
        fieldName,
        fieldLabel,
        skills,
        experience,
      });
      onRewrite?.(rewritten);
      setShowSuccessState(true);
      onSuccess?.(successMessage);

      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }

      successTimeoutRef.current = window.setTimeout(() => {
        setShowSuccessState(false);
        successTimeoutRef.current = null;
      }, SUCCESS_STATE_DURATION_MS);
    } catch (error) {
      onError?.(error?.message || "Could not rewrite this field.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRewrite}
      disabled={!hasValue || isLoading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
        showSuccessState
          ? "premium-status-success"
          : "premium-secondary-action"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {isLoading ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-[#67E8F9]" />
          Rewriting...
        </>
      ) : (
        <span>{showSuccessState ? "Rewritten" : label}</span>
      )}
    </button>
  );
}
