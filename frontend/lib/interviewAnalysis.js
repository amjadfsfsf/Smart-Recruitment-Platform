const EMPTY_TEXT = new Set(["", "none", "null", "undefined", "n/a", "na", "not available"]);

export function normalizeAnalysisEnvelope(result = {}) {
  const root = pickObject(result?.data, result);
  const nestedInterview = pickObject(root?.interview, root?.session);
  const analysis = pickObject(
    root?.analysis,
    root?.report?.analysis,
    nestedInterview?.analysis,
    root?.data?.analysis,
  );
  const scores = pickObject(root?.scores, analysis?.scores, nestedInterview?.scores, root?.scoring_summary);
  const audioScore = pickObject(root?.audio_score, root?.audioScore, analysis?.audio_score, analysis?.audioScore);
  const videoScore = pickObject(root?.video_score, root?.videoScore, analysis?.video_score, analysis?.videoScore);
  const candidatePosition = pickObject(
    root?.candidate_position,
    root?.candidatePosition,
    analysis?.candidate_position,
    analysis?.candidatePosition,
    root?.performance_overview,
  );

  return {
    root,
    nestedInterview,
    analysis: cleanObject({
      ...analysis,
      audio_score: audioScore || analysis?.audio_score,
      video_score: videoScore || analysis?.video_score,
      scores: scores || analysis?.scores,
      candidate_position: candidatePosition || analysis?.candidate_position,
    }),
    audioScore,
    videoScore,
    scores,
    candidatePosition,
  };
}

export function warnMissingAnalysisFields(result, report) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  if (!result || !report) return;

  const missing = [];
  if (!hasMeaningfulValue(report.position?.reasoning_summary || report.position?.summary)) missing.push("summary");
  if (!hasMeaningfulValue(report.position?.strengths)) missing.push("strengths");
  if (!hasMeaningfulValue(report.position?.gaps)) missing.push("gaps");
  if (!hasMeaningfulValue(report.video)) missing.push("video metrics");
  if (!hasMeaningfulValue(report.scores)) missing.push("scoring breakdown");

  if (missing.length) {
    console.warn("[InterviewAnalytics] Missing normalized recruiter analysis fields:", missing, {
      responseKeys: Object.keys(result || {}),
      report,
    });
  }
}

export function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return !EMPTY_TEXT.has(value.trim().toLowerCase());
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (isPlainObject(value)) return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function pickObject(...values) {
  return values.find((value) => isPlainObject(value) && Object.keys(value).length) || {};
}

function cleanObject(object) {
  if (!isPlainObject(object)) return {};
  return Object.fromEntries(
    Object.entries(object)
      .map(([key, value]) => [key, isPlainObject(value) ? cleanObject(value) : value])
      .filter(([, value]) => hasMeaningfulValue(value)),
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
