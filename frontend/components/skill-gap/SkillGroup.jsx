import SkillChip from "./SkillChip";

export default function SkillGroup({ title, skills, color = "blue" }) {
  const colorMap = {
    blue: "border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
    indigo: "border-indigo-300/15 bg-indigo-400/10 text-indigo-100",
    violet: "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100",
  };

  const badgeColor = colorMap[color] || colorMap.blue;

  return (
    <div className="dashboard-subcard rounded-2xl border p-5">
      <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-3">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}>
          {skills.length}
        </span>
      </div>
      
      {skills && skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <SkillChip key={skill} skill={skill} variant="default" />
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-white/[0.45]">None identified</p>
      )}
    </div>
  );
}
