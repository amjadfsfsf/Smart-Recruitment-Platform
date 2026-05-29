"use client";

import {
  findCustomSectionData,
  getStandardSectionTitle,
  hasText,
  normalizeExternalUrl,
  splitCsv,
  splitLines,
} from "@/lib/resumeBuilder";

function formatMonthLabel(value) {
  if (!value) {
    return "";
  }

  const [year, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return monthNames[monthIndex] ? `${monthNames[monthIndex]} ${year}` : value;
}

function hasEntryContent(entry = {}) {
  return Object.values(entry).some((value) => {
    if (typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return hasText(value);
  });
}

function SectionHeading({ title, styles }) {
  return (
    <div style={styles.headingWrapStyle}>
      <h3 className="text-black" style={styles.headingTextStyle}>
        {title.toUpperCase()}
      </h3>
    </div>
  );
}

function BodyText({ children, styles }) {
  return (
    <p className="text-black" style={styles.bodyTextStyle}>
      {children}
    </p>
  );
}

function MetaText({ children, styles, style = {} }) {
  return (
    <p style={{ ...styles.metaTextStyle, ...style }}>
      {children}
    </p>
  );
}

function TitleText({ children, styles, style = {} }) {
  return (
    <p className="text-black" style={{ ...styles.titleTextStyle, ...style }}>
      {children}
    </p>
  );
}

function Placeholder({ text, styles }) {
  return <p className="italic text-slate-500" style={styles.bodyTextStyle}>{text}</p>;
}

function BulletList({ lines, styles }) {
  return (
    <ul className="resume-print-list" style={styles.listStyle}>
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} style={index === 0 ? styles.bodyTextStyle : { ...styles.bodyTextStyle, ...styles.listItemStyle }}>
          {line}
        </li>
      ))}
    </ul>
  );
}

function SectionWrapper({ children, styles, className = "" }) {
  return (
    <section className={`resume-print-section ${className}`.trim()} style={styles.sectionStyle}>
      {children}
    </section>
  );
}

function MetaRow({ left, right, styles }) {
  return (
    <div className={styles.rowClassName} style={styles.rowStyle}>
      <div className={styles.rowLeftClassName} style={styles.rowLeftStyle}>
        {left}
      </div>
      <div className={styles.rowRightClassName} style={styles.rowRightStyle}>
        {right}
      </div>
    </div>
  );
}

function renderCustomSection(section, resumeData, styles) {
  const customSection = findCustomSectionData(resumeData?.customSections || [], section.id);
  const lines = splitLines(customSection?.content || "");

  return (
    <SectionWrapper styles={styles}>
      <SectionHeading title={section.title || "Custom Section"} styles={styles} />
      {lines.length > 1 ? (
        <BulletList lines={lines} styles={styles} />
      ) : lines.length === 1 ? (
        <BodyText styles={styles}>{lines[0]}</BodyText>
      ) : (
        <Placeholder text="Custom section content will appear here." styles={styles} />
      )}
    </SectionWrapper>
  );
}

export default function ResumeSectionRenderer({ section, resumeData, styles }) {
  const resolvedSectionTitle = getStandardSectionTitle(section?.type, section?.title);
  const education = (resumeData?.education || []).filter(hasEntryContent);
  const experience = (resumeData?.experience || []).filter(hasEntryContent);
  const skills = (resumeData?.skills || [])
    .map((item) => item?.name?.trim())
    .filter(Boolean);
  const projects = (resumeData?.projects || []).filter(hasEntryContent);
  const certifications = (resumeData?.certifications || []).filter(hasEntryContent);
  const languages = (resumeData?.languages || []).filter(hasEntryContent);
  const summary = resumeData?.summary?.trim() || "";

  if (section.type === "summary") {
    const summaryLines = summary
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return (
      <SectionWrapper styles={styles}>
        <SectionHeading title={resolvedSectionTitle} styles={styles} />
        {summaryLines.length ? (
          <div style={styles.summaryStyle}>
            {summaryLines.map((line, index) => (
              <p
                key={`summary-line-${index}`}
                className="text-black"
                style={{ margin: index === 0 ? 0 : "0.4em 0 0" }}
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <Placeholder text="A strong ATS-friendly professional summary will appear here." styles={styles} />
        )}
      </SectionWrapper>
    );
  }

  if (section.type === "education") {
    return (
      <SectionWrapper styles={styles}>
        <SectionHeading title={resolvedSectionTitle} styles={styles} />
        {education.length ? (
          <div style={styles.sectionGroupStyle}>
            {education.map((item, index) => (
              <div key={`${item.universityName || "education"}-${index}`} className="resume-print-item" style={index === 0 ? undefined : styles.sectionItemStyle}>
                <MetaRow
                  styles={styles}
                  left={
                    <>
                      <TitleText styles={styles}>{item.universityName || "University Name"}</TitleText>
                      <MetaText styles={styles} style={styles.rowSecondaryStyle}>
                        {item.degree || "Degree"}
                      </MetaText>
                    </>
                  }
                  right={
                    <MetaText styles={styles}>{[item.startYear, item.endYear].filter(Boolean).join(" - ") || "Year - Year"}</MetaText>
                  }
                />
                {item.gpa?.trim() ? (
                  <MetaText styles={styles} style={styles.rowSecondaryStyle}>
                    GPA: {item.gpa.trim()}
                  </MetaText>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Placeholder text="Education details will appear here." styles={styles} />
        )}
      </SectionWrapper>
    );
  }

  if (section.type === "experience") {
    return (
      <SectionWrapper styles={styles}>
        <SectionHeading title={resolvedSectionTitle} styles={styles} />
        {experience.length ? (
          <div style={styles.sectionGroupStyle}>
            {experience.map((item, index) => {
              const bulletLines = splitLines(item.description);
              const dateLabel = item.isPresent
                ? `${formatMonthLabel(item.startDate)} - Present`
                : [formatMonthLabel(item.startDate), formatMonthLabel(item.endDate)].filter(Boolean).join(" - ");

              return (
                <div key={`${item.jobTitle || "experience"}-${index}`} className="resume-print-item" style={index === 0 ? undefined : styles.sectionItemStyle}>
                  <MetaRow
                    styles={styles}
                    left={
                      <>
                        <TitleText styles={styles}>{item.jobTitle || "Job Title"}</TitleText>
                        <MetaText styles={styles} style={styles.rowSecondaryStyle}>
                          {item.companyName || "Company Name"}
                        </MetaText>
                      </>
                    }
                    right={<MetaText styles={styles}>{dateLabel || "Start Date - End Date"}</MetaText>}
                  />

                  {bulletLines.length ? (
                    <BulletList lines={bulletLines} styles={styles} />
                  ) : (
                    <Placeholder text="Experience bullet points will appear here." styles={styles} />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Placeholder text="Professional experience will appear here." styles={styles} />
        )}
      </SectionWrapper>
    );
  }

  if (section.type === "skills") {
    return (
      <SectionWrapper styles={styles}>
        <SectionHeading title={resolvedSectionTitle} styles={styles} />
        {skills.length ? (
          <BodyText styles={styles}>{skills.join(" \u2022 ")}</BodyText>
        ) : (
          <Placeholder text="Add at least three skills to complete this section." styles={styles} />
        )}
      </SectionWrapper>
    );
  }

  if (section.type === "projects") {
    return (
      <SectionWrapper styles={styles}>
        <SectionHeading title={resolvedSectionTitle} styles={styles} />
        {projects.length ? (
          <div style={styles.sectionGroupStyle}>
            {projects.map((item, index) => {
              const bulletLines = splitLines(item.description);
              const technologies = splitCsv(item.technologies || "");
              const projectUrl = normalizeExternalUrl(item.link);
              const projectBullets = technologies.length
                ? [...bulletLines, `Technologies: ${technologies.join(", ")}`]
                : bulletLines;

              return (
                <div key={`${item.name || "project"}-${index}`} className="resume-print-item" style={index === 0 ? undefined : styles.sectionItemStyle}>
                  <TitleText styles={styles}>
                    <>
                      <span>{item.name || "Project Name"}</span>
                      {projectUrl ? (
                        <>
                          <span style={styles.inlineMetaGapStyle}>|</span>
                          <a
                            href={projectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline underline-offset-2"
                            style={styles.inlineMetaGapStyle}
                          >
                            Project Link
                          </a>
                        </>
                      ) : null}
                    </>
                  </TitleText>

                  {projectBullets.length ? <BulletList lines={projectBullets} styles={styles} /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <Placeholder text="Projects and technologies will appear here." styles={styles} />
        )}
      </SectionWrapper>
    );
  }

  if (section.type === "certifications") {
    return (
      <SectionWrapper styles={styles} className="certifications-section">
        <SectionHeading title={resolvedSectionTitle} styles={styles} />
        {certifications.length ? (
          <div style={styles.sectionGroupStyle}>
            {certifications.map((item, index) => (
              <div key={`${item.name || "certification"}-${index}`} className="resume-print-item certification-item" style={index === 0 ? undefined : styles.sectionItemStyle}>
                <MetaRow
                  styles={styles}
                  left={
                    <BodyText styles={styles}>
                      <span className="font-bold">{item.name || "Certification Name"}</span>
                      {" | "}
                      {item.provider || "Provider"}
                    </BodyText>
                  }
                  right={<MetaText styles={styles}>{item.year || "Year"}</MetaText>}
                />
              </div>
            ))}
          </div>
        ) : (
          <Placeholder text="Certification details will appear here." styles={styles} />
        )}
      </SectionWrapper>
    );
  }

  if (section.type === "languages") {
    return (
      <SectionWrapper styles={styles}>
        <SectionHeading title={resolvedSectionTitle} styles={styles} />
        {languages.length ? (
          <div style={styles.sectionGroupStyle}>
            {languages.map((item, index) => (
              <div key={`${item.language || "language"}-${index}`} className="resume-print-item" style={index === 0 ? undefined : styles.sectionItemStyle}>
                <MetaRow
                  styles={styles}
                  left={<TitleText styles={styles}>{item.language || "Language"}</TitleText>}
                  right={<MetaText styles={styles}>{item.level || "Proficiency"}</MetaText>}
                />
              </div>
            ))}
          </div>
        ) : (
          <Placeholder text="Language proficiency will appear here." styles={styles} />
        )}
      </SectionWrapper>
    );
  }

  return renderCustomSection(section, resumeData, styles);
}
