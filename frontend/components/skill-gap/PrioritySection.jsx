import SkillChip from "./SkillChip";

export default function PrioritySection({ missingByLevel }) {
  const priorities = [
    { level: "HIGH", label: "High Priority", color: "danger", description: "Critical skills missing for this role" },
    { level: "MEDIUM", label: "Medium Priority", color: "warning", description: "Important but secondary skills" },
    { level: "LOW", label: "Low Priority", color: "success", description: "Nice-to-have or bonus skills" },
  ];

  return (
    <section className="dashboard-card rounded-[1.5rem] border p-6">
      <div className="mb-6 border-b border-white/[0.08] pb-4">
        <h3 className="text-xl font-semibold tracking-normal text-white">Priority Benchmark</h3>
        <p className="mt-2 text-sm leading-6 text-white/[0.62]">Focus on acquiring high-priority missing skills first.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {priorities.map(({ level, label, color, description }) => {
          const skills = missingByLevel[level] || [];
          
          return (
            <div key={level} className="flex flex-col">
              <div className="mb-3 flex flex-col">
                <span className="text-sm font-bold uppercase tracking-wide text-white/[0.76]">{label}</span>
                <span className="mt-0.5 text-xs text-white/[0.5]">{description}</span>
              </div>
              
              <div className="dashboard-subcard flex-1 rounded-xl border p-4">
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <SkillChip key={skill} skill={skill} variant={color} />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/[0.1] bg-white/[0.035] px-4 py-8 text-center text-sm italic text-white/[0.45]">
                    No skills in this tier
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
