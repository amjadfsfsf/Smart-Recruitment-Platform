"use client";

import ClassicTemplate from "./ClassicTemplate";
import CompactTemplate from "./CompactTemplate";
import ElegantGrayTemplate from "./ElegantGrayTemplate";
import MinimalBoldTemplate from "./MinimalBoldTemplate";
import SidebarCleanTemplate from "./SidebarCleanTemplate";
import SidebarTemplate from "./SidebarTemplate";

const templates = {
  "classic-ats": ClassicTemplate,
  "minimal-bold": MinimalBoldTemplate,
  "elegant-gray": ElegantGrayTemplate,
  "sidebar-clean": SidebarCleanTemplate,
  "sidebar-blue": (props) => <SidebarTemplate {...props} theme="blue" />,
  "sidebar-green": (props) => <SidebarTemplate {...props} theme="green" />,
  "sidebar-purple": (props) => <SidebarTemplate {...props} theme="purple" />,
  "sidebar-dark": (props) => <SidebarTemplate {...props} theme="dark" />,
  "compact-professional": CompactTemplate,
  "modern-minimal": MinimalBoldTemplate,
  "creative-sidebar": SidebarCleanTemplate,
};

export default function TemplateRenderer({ templateId, ...props }) {
  const TemplateComponent = templates[templateId] || ClassicTemplate;
  return <TemplateComponent {...props} />;
}
