const PRINT_DOCUMENT_WIDTH = 800;
const A4_RATIO = 297 / 210;
const A4_HEIGHT_AT_LAYOUT_WIDTH = PRINT_DOCUMENT_WIDTH * A4_RATIO;

const PRINT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 0;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #000000;
  }

  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .resume-print-root {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 0;
    background: #ffffff;
    overflow: hidden;
  }

  .resume-print-page {
    width: 210mm;
    min-height: 297mm;
    padding: 0;
    overflow: hidden;
  }

  .resume-print-scale-frame {
    width: ${PRINT_DOCUMENT_WIDTH}px;
    transform-origin: top left;
    overflow: hidden;
  }

  .resume-print-shell,
  .resume-print-document {
    width: ${PRINT_DOCUMENT_WIDTH}px !important;
    min-width: ${PRINT_DOCUMENT_WIDTH}px !important;
    max-width: ${PRINT_DOCUMENT_WIDTH}px !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    background: #ffffff !important;
  }

  .resume-sidebar-layout.resume-print-shell,
  .resume-sidebar-layout.resume-print-document {
    display: flex !important;
    flex-direction: column !important;
    min-height: ${A4_HEIGHT_AT_LAYOUT_WIDTH}px !important;
  }

  .resume-sidebar-layout > .grid,
  .resume-sidebar-layout > [class*="template-grid"] {
    flex: 1 0 auto !important;
    min-height: 100% !important;
  }

  .resume-sidebar-layout > .grid > aside,
  .resume-sidebar-layout > [class*="template-grid"] > aside {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .resume-print-item,
  .resume-print-list,
  .certification-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .certifications-section {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    page-break-before: auto;
  }

  .certification-item {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  @media print {
    * {
      box-sizing: border-box;
    }

    .resume-print-root,
    .resume-print-page {
      width: 210mm;
      min-height: 100vh;
      overflow: visible !important;
    }

    .resume-print-scale-frame {
      overflow: visible !important;
    }

    .resume-print-shell,
    .resume-print-document {
      width: ${PRINT_DOCUMENT_WIDTH}px !important;
      min-width: ${PRINT_DOCUMENT_WIDTH}px !important;
      max-width: ${PRINT_DOCUMENT_WIDTH}px !important;
    }

    .resume-sidebar-layout > .grid > aside,
    .resume-sidebar-layout > [class*="template-grid"] > aside {
      position: relative !important;
      z-index: 0 !important;
      height: 100% !important;
    }

    .resume-sidebar-layout > .grid > aside::before,
    .resume-sidebar-layout > [class*="template-grid"] > aside::before {
      content: '' !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 240px !important;
      height: 100vh !important;
      background: inherit !important;
      border-right: inherit !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      z-index: -1 !important;
    }

    .resume-sidebar-layout > .creative-template-grid > aside::before {
      width: 220px !important;
    }

    .resume-sidebar-layout .resume-print-section {
      page-break-inside: auto !important;
      break-inside: auto !important;
    }

    .resume-sidebar-layout .resume-print-item {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .certifications-section {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      page-break-before: auto;
    }

    .resume-sidebar-layout .certifications-section {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    .certification-item {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    .resume-print-page {
      page-break-after: always;
    }
  }
`;

function getPrintableFileName(fileName = "resume") {
  const printableTitle = String(fileName || "resume")
    .replace(/[^\w\s-]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return printableTitle || "resume";
}

function resolveExportElement(previewElement) {
  if (previewElement instanceof HTMLElement) {
    return previewElement;
  }

  if (typeof previewElement === "string" && typeof document !== "undefined") {
    return document.getElementById(previewElement);
  }

  if (typeof document === "undefined") {
    return null;
  }

  return document.getElementById("resume-preview");
}

function getHeadMarkup() {
  if (typeof document === "undefined") {
    return "";
  }

  return Array.from(document.head.querySelectorAll("style, link[rel='stylesheet']"))
    .map((node) => node.outerHTML)
    .join("\n");
}

function createPrintFrame() {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-1";
  document.body.appendChild(iframe);
  return iframe;
}

function writePrintDocument(iframe, title) {
  const iframeDocument = iframe.contentDocument;

  if (!iframeDocument) {
    throw new Error("Could not open the print document.");
  }

  iframeDocument.open();
  iframeDocument.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        ${getHeadMarkup()}
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        <div class="resume-print-root">
          <div class="resume-print-page">
            <div class="resume-print-scale-frame" data-print-scale-frame="true"></div>
          </div>
        </div>
      </body>
    </html>
  `);
  iframeDocument.close();

  return iframeDocument;
}

function prepareClonedResume(sourceElement, iframeDocument) {
  const scaleFrame = iframeDocument.querySelector("[data-print-scale-frame='true']");

  if (!scaleFrame) {
    throw new Error("Print frame is missing.");
  }

  const clonedResume = sourceElement.cloneNode(true);
  clonedResume.removeAttribute("id");
  clonedResume.classList.add("resume-print-document");
  scaleFrame.appendChild(clonedResume);

  return { scaleFrame, clonedResume };
}

function scaleResumeToSinglePage(scaleFrame, clonedResume) {
  const contentHeight = clonedResume.scrollHeight || clonedResume.offsetHeight || 0;

  if (!contentHeight) {
    return;
  }

  const scale = Math.min(1, A4_HEIGHT_AT_LAYOUT_WIDTH / contentHeight);
  scaleFrame.style.height = `${Math.ceil(contentHeight * scale)}px`;
  scaleFrame.style.transform = `scale(${scale})`;
}

async function waitForPrintDocument(iframeDocument) {
  if (iframeDocument.fonts?.ready) {
    try {
      await iframeDocument.fonts.ready;
    } catch {
      // Fall back to printing with safe system fonts if the font promise rejects.
    }
  }

  await new Promise((resolve) => window.setTimeout(resolve, 150));
}

function printFrame(iframe, printableTitle) {
  return new Promise((resolve) => {
    const iframeWindow = iframe.contentWindow;

    if (!iframeWindow) {
      iframe.remove();
      resolve();
      return;
    }

    let finished = false;

    const cleanup = () => {
      if (finished) {
        return;
      }

      finished = true;
      window.setTimeout(() => iframe.remove(), 0);
      resolve();
    };

    iframeWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 4000);

    iframeWindow.document.title = printableTitle;
    iframeWindow.focus();
    iframeWindow.print();
  });
}

export async function exportResumeAsPDF(previewElement, fileName = "resume") {
  const resolvedPreviewElement = resolveExportElement(previewElement);

  if (!resolvedPreviewElement) {
    throw new Error("Template not found.");
  }

  const previewMarkup = resolvedPreviewElement.innerHTML?.trim() || "";

  if (!previewMarkup) {
    throw new Error("Resume content is empty.");
  }

  const printableTitle = getPrintableFileName(fileName);
  const iframe = createPrintFrame();

  try {
    const iframeDocument = writePrintDocument(iframe, printableTitle);
    const { scaleFrame, clonedResume } = prepareClonedResume(resolvedPreviewElement, iframeDocument);
    await waitForPrintDocument(iframeDocument);
    scaleResumeToSinglePage(scaleFrame, clonedResume);
    await printFrame(iframe, printableTitle);
  } catch (error) {
    iframe.remove();
    throw error;
  }
}
