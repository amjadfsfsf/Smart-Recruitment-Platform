"use client";

import { normalizeExternalUrl } from "@/lib/resumeBuilder";
import ResumeSectionRenderer from "../ResumeSectionRenderer";
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, TEMPLATE_STYLE_PRESETS, getResolvedTemplateStyles } from "./BaseResumeTemplate";
import { buildSidebarSections } from "./sidebarSectionUtils";

const CREATIVE_TEMPLATE_PRESET = {
  ...TEMPLATE_STYLE_PRESETS.modern,
  headingColor: "#0f766e",
  dividerColor: "#99f6e4",
  shellPaddingX: 0,
  shellPaddingY: 0,
};

const SIDEBAR_SECTION_TYPES = new Set(["skills", "certifications", "languages"]);

function createSidebarStyles(baseStyles) {
  return {
    ...baseStyles,
    headingWrapStyle: {
      ...baseStyles.headingWrapStyle,
      borderBottom: "0.5px solid rgba(255, 255, 255, 0.28)",
    },
    headingTextStyle: {
      ...baseStyles.headingTextStyle,
      color: "#ecfeff",
    },
    bodyTextStyle: {
      ...baseStyles.bodyTextStyle,
      color: "#f8fafc",
    },
    titleTextStyle: {
      ...baseStyles.titleTextStyle,
      color: "#ffffff",
    },
    metaTextStyle: {
      ...baseStyles.metaTextStyle,
      color: "#cffafe",
    },
    summaryStyle: {
      ...baseStyles.summaryStyle,
      color: "#f8fafc",
    },
  };
}

export default function CreativeTemplate({
  resumeData,
  previewRef,
  sections = [],
  showPersonalInfo = true,
  compressionLevel = 0,
  renderMode = "screen",
  containerId = "resume-preview",
  className = "",
  showShadow = true,
  containerStyle = {},
}) {
  const baseStyles = getResolvedTemplateStyles(CREATIVE_TEMPLATE_PRESET, compressionLevel, renderMode);
  const sidebarStyles = createSidebarStyles(baseStyles);
  const visibleSections = sections.filter((section) => section.visible);
  const sidebarSections = buildSidebarSections(visibleSections, SIDEBAR_SECTION_TYPES);
  const mainSections = visibleSections.filter((section) => !SIDEBAR_SECTION_TYPES.has(section.type));
  const personalInfo = resumeData?.personalInfo || {};
  const links = Array.isArray(personalInfo.links) ? personalInfo.links : [];
  const linkItems = links
    .map((link) => {
      const normalizedUrl = normalizeExternalUrl(link.url);
      if (!normalizedUrl) return null;
      return {
        isLink: true,
        label: link.label?.trim() || "Link",
        url: normalizedUrl,
      };
    })
    .filter(Boolean);

  const contactItems = [
    personalInfo.email?.trim(),
    personalInfo.phone?.trim(),
    personalInfo.location?.trim(),
    ...linkItems,
  ].filter(Boolean);

  return (
    <div
      id={containerId}
      ref={previewRef}
      data-resume-preview="true"
      className={`resume-print-shell resume-layout-print resume-sidebar-layout mx-auto bg-white text-black ${className}`}
      style={{
        width: DOCUMENT_WIDTH,
        minWidth: DOCUMENT_WIDTH,
        maxWidth: DOCUMENT_WIDTH,
        minHeight: DOCUMENT_HEIGHT,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "Arial, Helvetica, sans-serif",
        lineHeight: 1.4,
        boxShadow: showShadow && renderMode !== "print" ? "0 18px 45px rgba(15, 23, 42, 0.08)" : "none",
        borderRadius: renderMode === "print" ? 0 : 20,
        overflow: "hidden",
        ...containerStyle,
      }}
    >
      <div
        className="creative-template-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "220px minmax(0, 1fr)",
          flex: "1 0 auto",
          minHeight: "100%",
        }}
      >
        <aside
          className="creative-template-sidebar"
          style={{
            background: "linear-gradient(180deg, #0f766e 0%, #155e75 100%)",
            color: "#ffffff",
            padding: "32px 24px",
            borderRight: "4px solid #5eead4",
          }}
        >
          {showPersonalInfo ? (
            <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "26px",
                  lineHeight: 1.05,
                  letterSpacing: "0.05em",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#ffffff",
                }}
              >
                {personalInfo.fullName?.trim() || "Your Name"}
              </h1>
              <div style={{ marginTop: 14 }}>
                {contactItems.length ? (
                  contactItems.map((item, index) => (
                    <p
                      key={`creative-contact-${index}`}
                      style={{
                        margin: index === 0 ? 0 : "8px 0 0",
                        fontSize: "12px",
                        lineHeight: 1.4,
                        color: "#ecfeff",
                        wordBreak: "normal",
                        overflowWrap: "break-word",
                      }}
                    >
                      {item.isLink ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "#ecfeff", textDecoration: "underline" }}>
                          {item.label}
                        </a>
                      ) : (
                        item
                      )}
                    </p>
                  ))
                ) : (
                  <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.4, color: "#ecfeff" }}>
                    email@example.com
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: showPersonalInfo ? 20 : 0 }}>
            {sidebarSections.map((section) => (
              <ResumeSectionRenderer key={section.id} section={section} resumeData={resumeData} styles={sidebarStyles} renderMode={renderMode} />
            ))}
          </div>
        </aside>

        <main
          className="creative-template-main"
          style={{
            padding: "34px 36px",
            backgroundColor: "#ffffff",
          }}
        >
          {mainSections.map((section) => (
            <ResumeSectionRenderer key={section.id} section={section} resumeData={resumeData} styles={baseStyles} renderMode={renderMode} />
          ))}
        </main>
      </div>
    </div>
  );
}
