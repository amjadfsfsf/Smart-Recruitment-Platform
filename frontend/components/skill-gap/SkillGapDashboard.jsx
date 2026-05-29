import ScoreCard from "./ScoreCard";
import InsightsPanel from "./InsightsPanel";
import SkillGroup from "./SkillGroup";
import PrioritySection from "./PrioritySection";
import MatchedSkillsSection from "./MatchedSkillsSection";

export default function SkillGapDashboard({ analysis, userProfile }) {
  if (!analysis) return null;

  const totalMissing = analysis.missingSkills?.length || 0;

  // missingByCategory expects structure: { technical: [], tools: [], soft: [] }
  const missingByCategory = analysis.missingByCategory || { technical: [], tools: [], soft: [] };
  const exactMatches = analysis.exactMatches || [];
  const semanticMatches = analysis.semanticMatches || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Section: Score and Insights */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ScoreCard 
            score={analysis.score} 
            previousScore={analysis.previousScore} 
            scoreDelta={analysis.scoreDelta}
            totalMissing={totalMissing}
          />
        </div>
        <div className="lg:col-span-2">
          <InsightsPanel 
            improvementSummary={analysis.insights}
            newlyAcquiredSkills={analysis.newlyAddedSkillsDetected}
            source={analysis.source}
          />
        </div>
      </div>

      {/* Matched Skills (exact + semantic) */}
      <MatchedSkillsSection
        exactMatches={exactMatches}
        semanticMatches={semanticMatches}
      />

      {/* Main Section: Breakdown by Category */}
      <section className="dashboard-card rounded-[1.5rem] border p-6">
        <div className="mb-6">
          <h3 className="text-xl font-semibold tracking-normal text-white">Missing Skills Breakdown</h3>
          <p className="mt-2 text-sm leading-6 text-white/[0.62]">Skills categorized by domain to help you focus your learning.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <SkillGroup title="Technical Skills" skills={missingByCategory.technical} color="indigo" />
          <SkillGroup title="Tools & Technologies" skills={missingByCategory.tools} color="blue" />
          <SkillGroup title="Soft Skills" skills={missingByCategory.soft} color="violet" />
        </div>
      </section>

      {/* Priority Section */}
      <PrioritySection missingByLevel={analysis.missingByLevel} />
    </div>
  );
}
