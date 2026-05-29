"use client";

import { normalizeExternalUrl } from "@/lib/resumeBuilder";
import { getResumeCompressionSettings } from "@/lib/resumeCompression";
import ResumeSectionRenderer from "../ResumeSectionRenderer";

export const DOCUMENT_WIDTH = 800;
export const DOCUMENT_HEIGHT = Math.ceil(DOCUMENT_WIDTH * (297 / 210));

export const TEMPLATE_STYLE_PRESETS = {
  classic: {
    alignment: "center",
    nameSize: 28,
    nameTracking: "0.08em",
    headingSize: 12,
    headingTracking: "2px",
    bodySize: 14,
    titleSize: 14,
    metaSize: 12.5,
    shellPaddingX: 48,
    shellPaddingY: 38,
    headingColor: "#0f172a",
    dividerColor: "#cbd5e1",
    sectionBackground: "transparent",
    sectionBorder: "transparent",
    sectionRadius: 0,
    sectionPaddingX: 0,
    sectionPaddingY: 0,
  },
  minimalBold: {
    alignment: "left",
    nameSize: 32,
    nameTracking: "0.04em",
    headingSize: 12,
    headingTracking: "2px",
    bodySize: 14,
    titleSize: 14,
    metaSize: 12.5,
    shellPaddingX: 50,
    shellPaddingY: 36,
    headingColor: "#0f172a",
    dividerColor: "#d1d5db",
    sectionBackground: "transparent",
    sectionBorder: "transparent",
    sectionRadius: 0,
    sectionPaddingX: 0,
    sectionPaddingY: 0,
  },
  elegantGray: {
    alignment: "left",
    nameSize: 29,
    nameTracking: "0.04em",
    headingSize: 12.5,
    headingTracking: "2px",
    bodySize: 14,
    titleSize: 14,
    metaSize: 12.5,
    shellPaddingX: 34,
    shellPaddingY: 30,
    headingColor: "#334155",
    dividerColor: "#e2e8f0",
    sectionBackground: "#f8fafc",
    sectionBorder: "#e2e8f0",
    sectionRadius: 16,
    sectionPaddingX: 18,
    sectionPaddingY: 14,
  },
  modern: {
    alignment: "left",
    nameSize: 29,
    nameTracking: "0.05em",
    headingSize: 12,
    headingTracking: "2px",
    bodySize: 14,
    titleSize: 14,
    metaSize: 12.5,
    shellPaddingX: 48,
    shellPaddingY: 38,
    headingColor: "#2563eb",
    dividerColor: "#bfdbfe",
    sectionBackground: "transparent",
    sectionBorder: "transparent",
    sectionRadius: 0,
    sectionPaddingX: 0,
    sectionPaddingY: 0,
  },
  compactProfessional: {
    alignment: "left",
    nameSize: 24,
    nameTracking: "0.04em",
    headingSize: 11,
    headingTracking: "2px",
    bodySize: 12.5,
    titleSize: 12.5,
    metaSize: 11.25,
    shellPaddingX: 34,
    shellPaddingY: 28,
    headingColor: "#0f172a",
    dividerColor: "#cbd5e1",
    sectionBackground: "transparent",
    sectionBorder: "transparent",
    sectionRadius: 0,
    sectionPaddingX: 0,
    sectionPaddingY: 0,
  },
  compact: {
    alignment: "left",
    nameSize: 24,
    nameTracking: "0.04em",
    headingSize: 11,
    headingTracking: "2px",
    bodySize: 12.5,
    titleSize: 12.5,
    metaSize: 11.25,
    shellPaddingX: 34,
    shellPaddingY: 28,
    headingColor: "#0f172a",
    dividerColor: "#cbd5e1",
    sectionBackground: "transparent",
    sectionBorder: "transparent",
    sectionRadius: 0,
    sectionPaddingX: 0,
    sectionPaddingY: 0,
  },
};

const DENSITY_STYLE_OVERRIDES = {
  0: {
    shellPaddingX: 0,
    shellPaddingY: 0,
    nameSize: 0,
    headingSize: 0,
    bodySize: 0,
    titleSize: 0,
    metaSize: 0,
    sectionGap: 16,
    titleGap: 8,
    bulletGap: 4,
  },
  1: {
    shellPaddingX: 4,
    shellPaddingY: 4,
    nameSize: 1,
    headingSize: 0.5,
    bodySize: 0.5,
    titleSize: 0.5,
    metaSize: 0.5,
    sectionGap: 14,
    titleGap: 8,
    bulletGap: 4,
  },
  2: {
    shellPaddingX: 8,
    shellPaddingY: 6,
    nameSize: 2,
    headingSize: 1,
    bodySize: 1,
    titleSize: 1,
    metaSize: 1,
    sectionGap: 12,
    titleGap: 6,
    bulletGap: 4,
  },
  3: {
    shellPaddingX: 10,
    shellPaddingY: 8,
    nameSize: 3,
    headingSize: 1,
    bodySize: 1,
    titleSize: 1,
    metaSize: 1,
    sectionGap: 10,
    titleGap: 6,
    bulletGap: 4,
  },
};

export function getResolvedTemplateStyles(baseStyles, compressionLevel = 0, renderMode = "screen") {
  const densityStyles = DENSITY_STYLE_OVERRIDES[compressionLevel] || DENSITY_STYLE_OVERRIDES[0];
  const isPrintLayout = renderMode === "print";
  const shadow = isPrintLayout ? "none" : "0 18px 45px rgba(15, 23, 42, 0.08)";

  return {
    shellClassName: "resume-print-shell resume-layout-print mx-auto bg-white text-black",
    shellStyle: {
      width: DOCUMENT_WIDTH,
      minWidth: DOCUMENT_WIDTH,
      maxWidth: DOCUMENT_WIDTH,
      minHeight: DOCUMENT_HEIGHT,
      margin: "0 auto",
      padding: `${baseStyles.shellPaddingY - densityStyles.shellPaddingY}px ${baseStyles.shellPaddingX - densityStyles.shellPaddingX}px`,
      backgroundColor: "#ffffff",
      color: "#000000",
      fontFamily: "Arial, Helvetica, sans-serif",
      lineHeight: 1.4,
      boxShadow: shadow,
      borderRadius: isPrintLayout ? 0 : 20,
    },
    headerStyle: {
      paddingBottom: 8,
      textAlign: baseStyles.alignment,
    },
    nameClassName: "font-bold uppercase text-black",
    nameStyle: {
      margin: 0,
      fontSize: `${baseStyles.nameSize - densityStyles.nameSize}px`,
      lineHeight: 1,
      letterSpacing: baseStyles.nameTracking,
    },
    contactStyle: {
      marginTop: 6,
      fontSize: `${baseStyles.metaSize - densityStyles.metaSize}px`,
      lineHeight: 1.4,
      wordBreak: "normal",
      overflowWrap: "break-word",
      textTransform: baseStyles.alignment === "center" ? "none" : "uppercase",
      letterSpacing: baseStyles.alignment === "center" ? "0" : "0.04em",
    },
    contactRowStyle: {
      display: "block",
      margin: 0,
    },
    mainStyle: {
      display: "block",
      paddingTop: 8,
    },
    sectionStyle: {
      margin: 0,
      padding: `${baseStyles.sectionPaddingY || 0}px ${baseStyles.sectionPaddingX || 0}px`,
      backgroundColor: baseStyles.sectionBackground || "transparent",
      border: baseStyles.sectionBorder && baseStyles.sectionBorder !== "transparent" ? `1px solid ${baseStyles.sectionBorder}` : "none",
      borderRadius: baseStyles.sectionRadius || 0,
    },
    sectionGroupStyle: {
      display: "block",
    },
    sectionItemStyle: {
      marginTop: `${densityStyles.sectionGap}px`,
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    headingWrapStyle: {
      marginTop: 16,
      marginBottom: 6,
      paddingBottom: 4,
      borderBottom: `0.5px solid ${baseStyles.dividerColor || "#cbd5e1"}`,
    },
    headingTextStyle: {
      margin: 0,
      fontSize: `${baseStyles.headingSize - densityStyles.headingSize}px`,
      lineHeight: 1.2,
      letterSpacing: baseStyles.headingTracking,
      fontWeight: 700,
      textTransform: "uppercase",
      color: baseStyles.headingColor || "#0f172a",
    },
    bodyTextStyle: {
      margin: 0,
      fontSize: `${baseStyles.bodySize - densityStyles.bodySize}px`,
      lineHeight: 1.4,
      wordBreak: "normal",
      overflowWrap: "break-word",
    },
    titleTextStyle: {
      margin: 0,
      fontSize: `${baseStyles.titleSize - densityStyles.titleSize}px`,
      lineHeight: 1.4,
      fontWeight: 700,
      wordBreak: "normal",
      overflowWrap: "break-word",
    },
    metaTextStyle: {
      margin: 0,
      fontSize: `${baseStyles.metaSize - densityStyles.metaSize}px`,
      lineHeight: 1.4,
      color: "#334155",
      wordBreak: "normal",
      overflowWrap: "break-word",
    },
    rowClassName: "resume-meta-row",
    rowStyle: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "start",
      columnGap: 16,
      margin: 0,
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    rowLeftClassName: "resume-meta-left",
    rowLeftStyle: {
      minWidth: 0,
      margin: 0,
    },
    rowRightClassName: "resume-meta-right",
    rowRightStyle: {
      minWidth: "max-content",
      margin: 0,
      paddingLeft: 12,
      textAlign: "right",
      whiteSpace: "nowrap",
      justifySelf: "end",
    },
    rowSecondaryStyle: {
      marginTop: `${densityStyles.titleGap}px`,
    },
    listStyle: {
      marginTop: `${densityStyles.titleGap}px`,
      marginBottom: 0,
      paddingLeft: 18,
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    listItemStyle: {
      marginTop: `${densityStyles.bulletGap}px`,
    },
    summaryStyle: {
      margin: 0,
      fontSize: `${baseStyles.bodySize - densityStyles.bodySize}px`,
      lineHeight: 1.4,
      whiteSpace: "pre-line",
      wordBreak: "break-word",
      overflowWrap: "break-word",
      hyphens: "none",
    },
    inlineMetaGapStyle: {
      marginLeft: 6,
    },
    compressionLabel: getResumeCompressionSettings(compressionLevel).label,
  };
}

export default function BaseResumeTemplate({
  resumeData,
  previewRef,
  sections = [],
  showPersonalInfo = true,
  styles,
  compressionLevel = 0,
  renderMode = "screen",
  containerId = "resume-preview",
  className = "",
  showShadow = true,
  containerStyle = {},
}) {
  const resolvedStyles = getResolvedTemplateStyles(styles, compressionLevel, renderMode);
  const personalInfo = resumeData?.personalInfo || {};
  const visibleSections = sections.filter((section) => section.visible && section.type !== "certifications");
  const links = Array.isArray(personalInfo.links) ? personalInfo.links : [];
  const linkItems = links
    .map((link) => {
      const normalizedUrl = normalizeExternalUrl(link.url);
      if (!normalizedUrl) return null;
      
      return (
        <a
          key={normalizedUrl}
          href={normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline underline-offset-2"
        >
          {link.label?.trim() || "Link"}
        </a>
      );
    })
    .filter(Boolean);

  const contactItems = [
    personalInfo.email?.trim(),
    personalInfo.phone?.trim(),
    personalInfo.location?.trim(),
    ...linkItems,
  ].filter(Boolean);

  const contactContent = contactItems.length
    ? contactItems.map((item, index) => (
        <span key={`contact-${index}`}>
          {index > 0 ? " | " : ""}
          {item}
        </span>
      ))
    : "email@example.com | +1 555 010 1234 | City, Country | LinkedIn";

  return (
    <div
      id={containerId}
      ref={previewRef}
      data-resume-preview="true"
      className={`${resolvedStyles.shellClassName} ${className}`}
      style={{
        ...resolvedStyles.shellStyle,
        boxShadow: showShadow ? resolvedStyles.shellStyle.boxShadow : "none",
        ...containerStyle,
      }}
    >
      {showPersonalInfo ? (
        <header style={resolvedStyles.headerStyle}>
          <h1 className={resolvedStyles.nameClassName} style={resolvedStyles.nameStyle}>
            {personalInfo.fullName?.trim() || "Your Name"}
          </h1>
          <p style={resolvedStyles.contactStyle}>
            <span style={resolvedStyles.contactRowStyle}>{contactContent}</span>
          </p>
        </header>
      ) : null}

      <main style={showPersonalInfo ? resolvedStyles.mainStyle : { display: "block" }}>
        {visibleSections.map((section) => (
          <ResumeSectionRenderer
            key={section.id}
            section={section}
            resumeData={resumeData}
            styles={resolvedStyles}
            renderMode={renderMode}
          />
        ))}
      </main>
    </div>
  );
}
