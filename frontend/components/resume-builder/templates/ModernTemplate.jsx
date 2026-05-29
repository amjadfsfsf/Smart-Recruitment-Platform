"use client";

import BaseResumeTemplate, { TEMPLATE_STYLE_PRESETS } from "./BaseResumeTemplate";

export default function ModernTemplate(props) {
  return <BaseResumeTemplate {...props} styles={TEMPLATE_STYLE_PRESETS.modern} />;
}
