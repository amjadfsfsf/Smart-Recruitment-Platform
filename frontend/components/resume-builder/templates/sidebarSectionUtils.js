export function buildSidebarSections(visibleSections = [], sidebarSectionTypes = new Set()) {
  const certificationSection = visibleSections.find((section) => section.type === "certifications");
  const sidebarSections = visibleSections.filter((section) => sidebarSectionTypes.has(section.type) && section.type !== "certifications");

  if (!certificationSection) {
    return sidebarSections;
  }

  const orderedSections = [...sidebarSections];
  const skillsIndex = orderedSections.findIndex((section) => section.type === "skills");

  if (skillsIndex === -1) {
    orderedSections.push(certificationSection);
    return orderedSections;
  }

  orderedSections.splice(skillsIndex + 1, 0, certificationSection);
  return orderedSections;
}
