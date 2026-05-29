"use client";

import BaseResumeTemplate, { TEMPLATE_STYLE_PRESETS } from "./BaseResumeTemplate";

export default function MinimalBoldTemplate(props) {
  return <BaseResumeTemplate {...props} styles={TEMPLATE_STYLE_PRESETS.minimalBold} />;
}
