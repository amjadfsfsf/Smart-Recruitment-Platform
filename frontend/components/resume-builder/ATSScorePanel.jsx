"use client";

function getToneClasses(tone = "yellow") {
  if (tone === "green") {
    return {
      badge: "border border-cyan-300/15 bg-cyan-400/10 text-cyan-100 ring-cyan-300/20",
      bar: "premium-progress-fill",
      card: "border-cyan-300/15 bg-cyan-400/10",
    };
  }

  if (tone === "red") {
    return {
      badge: "border border-red-300/15 bg-red-500/10 text-red-100 ring-red-300/20",
      bar: "bg-red-500",
      card: "border-red-300/15 bg-red-500/10",
    };
  }

  return {
    badge: "border border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100 ring-fuchsia-300/20",
    bar: "premium-progress-fill-alt",
    card: "border-fuchsia-300/15 bg-fuchsia-400/10",
  };
}

function ScoreRow({ label, score, detail = "", weight = 0, weightedValue = 0 }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-white/[0.78]">{label}</span>
        <span className="text-white/[0.56]">
          {score}/100
          <span className="ml-2 text-xs">({weight}% weight - {weightedValue} pts)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#A78BFA] to-[#67E8F9] transition-all" style={{ width: `${score}%` }} />
      </div>
      {detail ? <p className="text-xs leading-5 text-white/[0.54]">{detail}</p> : null}
    </div>
  );
}

function ChecklistItem({ label, state }) {
  const stateClasses =
    state === "pass"
      ? "border-cyan-300/15 bg-cyan-400/10 text-cyan-100"
      : state === "neutral"
        ? "border-white/[0.08] bg-white/[0.06] text-white/[0.7]"
        : "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100";

  const stateLabel = state === "pass" ? "Yes" : state === "neutral" ? "Add target role" : "Needs work";

  return (
    <div className={`rounded-2xl border px-3 py-3 text-sm ${stateClasses}`}>
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-xs">{stateLabel}</p>
    </div>
  );
}

function BreakdownCard({ title, description, children }) {
  return (
    <div className="dashboard-subcard rounded-2xl border p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      {description ? <p className="mt-1 text-xs leading-5 text-white/[0.54]">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function KeywordPill({ keyword, matched }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs ${
        matched
          ? "border-cyan-300/15 bg-cyan-400/10 text-cyan-100"
          : "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100"
      }`}
    >
      {keyword}
    </span>
  );
}

export default function ATSScorePanel({ scoreData, jobTitle = "", jobDescription = "" }) {
  const toneClasses = getToneClasses(scoreData?.tone);
  const hasSkills = !scoreData.missingSections.includes("Skills");
  const hasExperience = !scoreData.missingSections.includes("Work Experience");
  const usesKeywords = jobTitle || jobDescription ? scoreData.matchedKeywords.length > 0 : null;
  const weights = scoreData?.weights || {};
  const weightedScores = scoreData?.weightedScores || {};
  const keywordBreakdown = scoreData?.breakdown?.keywords || {};
  const completenessBreakdown = scoreData?.breakdown?.completeness || {};
  const formattingBreakdown = scoreData?.breakdown?.formatting || {};
  const actionVerbBreakdown = scoreData?.breakdown?.actionVerbs || {};
  const bulletQualityBreakdown = scoreData?.breakdown?.bulletQuality || {};

  return (
    <section className="resume-editor-panel rounded-[1.6rem] border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">ATS Score</p>
          <p className="mt-1 text-xs leading-5 text-white/[0.58]">
            The final score is weighted from keyword matching, sections, formatting safety, action verbs, and bullet impact.
          </p>
        </div>

        <div className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${toneClasses.badge}`}>
          {scoreData.score}/100 - {scoreData.label}
        </div>
      </div>

      <div className={`mt-4 rounded-[1.35rem] border p-4 ${toneClasses.card}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">
            {jobTitle || jobDescription ? "Job-targeted scan" : "ATS scan needs a target role"}
          </p>
          {jobTitle ? <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/[0.5]">{jobTitle}</span> : null}
        </div>
        <div className="premium-progress-track mt-3 h-3 rounded-full">
          <div className={`h-full rounded-full transition-all ${toneClasses.bar}`} style={{ width: `${scoreData.score}%` }} />
        </div>
        <p className="mt-3 text-xs leading-5 text-white/[0.58]">
          Formula: ({scoreData.sectionScores.keywords} x {weights.keywords || 0}) + ({scoreData.sectionScores.completeness} x{" "}
          {weights.completeness || 0}) + ({scoreData.sectionScores.formatting} x {weights.formatting || 0}) + (
          {scoreData.sectionScores.actionVerbs} x {weights.actionVerbs || 0}) + ({scoreData.sectionScores.bulletQuality} x{" "}
          {weights.bulletQuality || 0}) = {scoreData.score}
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <ScoreRow label="Keywords Match" score={scoreData.sectionScores.keywords} weight={(weights.keywords || 0) * 100} weightedValue={weightedScores.keywords || 0} detail={`${keywordBreakdown.matchedCount || 0} of ${keywordBreakdown.totalKeywords || 0} extracted target keywords were found in the resume.`} />
        <ScoreRow label="Section Completeness" score={scoreData.sectionScores.completeness} weight={(weights.completeness || 0) * 100} weightedValue={weightedScores.completeness || 0} detail={`${completenessBreakdown.existingSections || 0} of ${completenessBreakdown.totalSections || 0} required sections are filled.`} />
        <ScoreRow label="Formatting Safety" score={scoreData.sectionScores.formatting} weight={(weights.formatting || 0) * 100} weightedValue={weightedScores.formatting || 0} detail={`${formattingBreakdown.emptyFieldCount || 0} empty required fields, ${formattingBreakdown.invalidDateCount || 0} date issues, ${formattingBreakdown.weirdCharacterCount || 0} weird character issues.`} />
        <ScoreRow label="Action Verbs" score={scoreData.sectionScores.actionVerbs} weight={(weights.actionVerbs || 0) * 100} weightedValue={weightedScores.actionVerbs || 0} detail={`${actionVerbBreakdown.strongBulletCount || 0} of ${actionVerbBreakdown.totalBullets || 0} bullets start with a strong verb.`} />
        <ScoreRow label="Bullet Quality" score={scoreData.sectionScores.bulletQuality} weight={(weights.bulletQuality || 0) * 100} weightedValue={weightedScores.bulletQuality || 0} detail={`${bulletQualityBreakdown.strongBulletCount || 0} of ${bulletQualityBreakdown.totalBullets || 0} bullets show measurable impact.`} />
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-white">ATS checklist</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ChecklistItem label="Has skills" state={hasSkills ? "pass" : "fail"} />
          <ChecklistItem label="Has work experience" state={hasExperience ? "pass" : "fail"} />
          <ChecklistItem label="Uses target keywords" state={usesKeywords === null ? "neutral" : usesKeywords ? "pass" : "fail"} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BreakdownCard title="Keyword Breakdown" description={keywordBreakdown.source}>
          {keywordBreakdown.totalKeywords ? (
            <>
              <p className="text-sm leading-6 text-white/[0.62]">{keywordBreakdown.explanation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(keywordBreakdown.keywords || []).map((keyword) => (
                  <KeywordPill key={keyword} keyword={keyword} matched={scoreData.matchedKeywords.includes(keyword)} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-white/[0.56]">Add a job title or job description to start keyword scoring.</p>
          )}
        </BreakdownCard>

        <BreakdownCard title="Required Sections" description="These four sections drive the completeness score.">
          <div className="space-y-2">
            {(completenessBreakdown.requiredSections || []).map((section) => (
              <div key={section.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.045] px-3 py-2 text-sm">
                <span className="text-white/[0.72]">{section.label}</span>
                <span className={section.present ? "font-medium text-cyan-100" : "font-medium text-fuchsia-100"}>
                  {section.present ? "Present" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </BreakdownCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BreakdownCard title="Formatting Safety" description="Starts at 100, then subtracts points for empty fields, date issues, and unusual characters.">
          <ul className="space-y-1 text-sm leading-6 text-white/[0.62]">
            <li>Checked fields: {formattingBreakdown.checkedFieldCount || 0}</li>
            <li>Empty required fields: {formattingBreakdown.emptyFieldCount || 0}</li>
            <li>Invalid dates: {formattingBreakdown.invalidDateCount || 0}</li>
            <li>Unusual characters: {formattingBreakdown.weirdCharacterCount || 0}</li>
            <li>Total penalty: {formattingBreakdown.penalties?.totalPenalty || 0}</li>
          </ul>
        </BreakdownCard>

        <BreakdownCard title="Bullet Writing" description="Action verbs and bullet quality are measured independently on the same bullets.">
          <ul className="space-y-1 text-sm leading-6 text-white/[0.62]">
            <li>{actionVerbBreakdown.explanation || "No bullets found yet."}</li>
            <li>{bulletQualityBreakdown.explanation || "No measurable bullets found yet."}</li>
          </ul>
        </BreakdownCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BreakdownCard title="Missing Keywords" description="These target keywords were not found in summary, skills, experience, or projects.">
          {scoreData.missingKeywords.length ? (
            <div className="flex flex-wrap gap-2">
              {scoreData.missingKeywords.map((keyword) => (
                <KeywordPill key={keyword} keyword={keyword} matched={false} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/[0.56]">
              {jobTitle || jobDescription ? "No missing keywords were detected." : "Add a target role to see missing keywords."}
            </p>
          )}
        </BreakdownCard>

        <BreakdownCard title="Detailed Feedback" description="Simple rule-based suggestions generated from the current score inputs.">
          {scoreData.feedbackItems.length ? (
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-white/[0.62]">
              {scoreData.feedbackItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/[0.56]">This resume is in a strong ATS-safe range.</p>
          )}
        </BreakdownCard>
      </div>
    </section>
  );
}
