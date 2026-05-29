"use client";

import { normalizeExternalUrl } from "@/lib/resumeBuilder";
import ResumeSectionRenderer from "../ResumeSectionRenderer";
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, TEMPLATE_STYLE_PRESETS, getResolvedTemplateStyles } from "./BaseResumeTemplate";
import { buildSidebarSections } from "./sidebarSectionUtils";

const SIDEBAR_TEMPLATE_PRESET = {
  ...TEMPLATE_STYLE_PRESETS.minimalBold,
  shellPaddingX: 0,
  shellPaddingY: 0,
  headingColor: "#0f172a",
  dividerColor: "#bfdbfe",
};

const SIDEBAR_SECTION_TYPES = new Set(["skills", "certifications", "languages"]);

export const themes = {
  blue: {
    sidebar: "bg-blue-800",
    text: "text-blue-200",
    heading: "#dbeafe",
    body: "#eff6ff",
    meta: "#bfdbfe",
    divider: "rgba(191, 219, 254, 0.28)",
    accent: "#38bdf8",
    panel: "linear-gradient(180deg, #1e3a8a 0%, #1d4ed8 100%)",
  },
  green: {
    sidebar: "bg-emerald-700",
    text: "text-emerald-200",
    heading: "#d1fae5",
    body: "#ecfdf5",
    meta: "#a7f3d0",
    divider: "rgba(167, 243, 208, 0.28)",
    accent: "#34d399",
    panel: "linear-gradient(180deg, #047857 0%, #059669 100%)",
  },
  purple: {
    sidebar: "bg-purple-700",
    text: "text-purple-200",
    heading: "#ede9fe",
    body: "#f5f3ff",
    meta: "#ddd6fe",
    divider: "rgba(221, 214, 254, 0.28)",
    accent: "#a78bfa",
    panel: "linear-gradient(180deg, #6d28d9 0%, #7c3aed 100%)",
  },
  dark: {
    sidebar: "bg-gray-900",
    text: "text-gray-300",
    heading: "#f8fafc",
    body: "#f8fafc",
    meta: "#cbd5e1",
    divider: "rgba(203, 213, 225, 0.24)",
    accent: "#64748b",
    panel: "linear-gradient(180deg, #111827 0%, #1f2937 100%)",
  },
};

function createSidebarStyles(baseStyles, themeConfig) {
  return {
    ...baseStyles,
    headingWrapStyle: {
      ...baseStyles.headingWrapStyle,
      borderBottom: `0.5px solid ${themeConfig.divider}`,
    },
    headingTextStyle: {
      ...baseStyles.headingTextStyle,
      color: themeConfig.heading,
    },
    bodyTextStyle: {
      ...baseStyles.bodyTextStyle,
      color: themeConfig.body,
    },
    titleTextStyle: {
      ...baseStyles.titleTextStyle,
      color: "#ffffff",
    },
    metaTextStyle: {
      ...baseStyles.metaTextStyle,
      color: themeConfig.meta,
    },
    summaryStyle: {
      ...baseStyles.summaryStyle,
      color: themeConfig.body,
    },
  };
}

export default function SidebarTemplate({
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
  theme = "blue",
}) {
  const themeConfig = themes[theme] || themes.blue;
  const baseStyles = getResolvedTemplateStyles(SIDEBAR_TEMPLATE_PRESET, compressionLevel, renderMode);
  const sidebarStyles = createSidebarStyles(baseStyles, themeConfig);
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
        className="grid"
        style={{
          gridTemplateColumns: "240px minmax(0, 1fr)",
          flex: "1 0 auto",
          minHeight: "100%",
        }}
      >
        <aside
          className={`${themeConfig.sidebar} text-white`}
          style={{
            background: themeConfig.panel,
            color: "#ffffff",
            padding: "34px 24px",
            borderRight: `4px solid ${themeConfig.accent}`,
          }}
        >
          {showPersonalInfo ? (
            <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "28px",
                  lineHeight: 1.05,
                  letterSpacing: "0.04em",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#ffffff",
                }}
              >
                {personalInfo.fullName?.trim() || "Your Name"}
              </h1>
              <div style={{ marginTop: 16 }}>
                {contactItems.length ? (
                  contactItems.map((item, index) => (
                    <p
                      key={`sidebar-${theme}-contact-${index}`}
                      className={themeConfig.text}
                      style={{
                        margin: index === 0 ? 0 : "8px 0 0",
                        fontSize: "12px",
                        lineHeight: 1.4,
                        wordBreak: "normal",
                        overflowWrap: "break-word",
                      }}
                    >
                      {item.isLink ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                          {item.label}
                        </a>
                      ) : (
                        item
                      )}
                    </p>
                  ))
                ) : (
                  <p className={themeConfig.text} style={{ margin: 0, fontSize: "12px", lineHeight: 1.4 }}>
                    email@example.com
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: showPersonalInfo ? 22 : 0 }}>
            {sidebarSections.map((section) => (
              <ResumeSectionRenderer key={section.id} section={section} resumeData={resumeData} styles={sidebarStyles} renderMode={renderMode} />
            ))}
          </div>
        </aside>

        <main
          className="bg-white"
          style={{
            padding: "34px 36px",
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
