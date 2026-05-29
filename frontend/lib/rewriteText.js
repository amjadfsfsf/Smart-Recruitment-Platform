function parseRewriteError(payload) {
  if (payload?.error) {
    return payload.error;
  }

  if (payload?.message) {
    return payload.message;
  }

  return "Could not rewrite this text right now.";
}

export async function rewriteText(text, options = {}) {
  const section = typeof options?.section === "string" ? options.section : "resume";
  const fieldName = typeof options?.fieldName === "string" ? options.fieldName : "";
  const fieldLabel = typeof options?.fieldLabel === "string" ? options.fieldLabel : "";
  const skills = typeof options?.skills === "string" ? options.skills : "";
  const experience = typeof options?.experience === "string" ? options.experience : "";
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, section, fieldName, fieldLabel, skills, experience }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(parseRewriteError(data));
  }

  if (typeof data?.rewritten !== "string" || !data.rewritten.trim()) {
    throw new Error("Rewrite service returned an empty result.");
  }

  return data.rewritten;
}
