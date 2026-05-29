"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH } from "./templates/BaseResumeTemplate";

function clampScale(value, minScale, maxScale) {
  const bounded = Math.min(maxScale, Math.max(minScale, value));
  return Math.round(bounded * 1000) / 1000;
}

export default function ResumeDocumentPreview({
  children,
  className = "",
  stageClassName = "",
  maxScale = 1,
  minScale = 0.22,
  initialScale = 0.42,
  horizontalInset = 0,
}) {
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(() => clampScale(initialScale, minScale, maxScale));

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const updateScale = () => {
      const availableWidth = Math.max(0, viewport.clientWidth - horizontalInset);
      if (!availableWidth) {
        return;
      }

      const fitScale = availableWidth / DOCUMENT_WIDTH;
      const nextScale = clampScale(fitScale, Math.min(minScale, fitScale), maxScale);
      setScale((currentScale) => (Math.abs(currentScale - nextScale) < 0.001 ? currentScale : nextScale));
    };

    updateScale();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScale);
    observer?.observe(viewport);
    window.addEventListener("resize", updateScale);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [horizontalInset, maxScale, minScale]);

  const stageStyle = useMemo(
    () => ({
      width: `${DOCUMENT_WIDTH * scale}px`,
      "--resume-preview-scale": scale,
    }),
    [scale],
  );

  const documentStyle = useMemo(
    () => ({
      width: DOCUMENT_WIDTH,
      minHeight: DOCUMENT_HEIGHT,
      marginLeft: `${DOCUMENT_WIDTH / -2}px`,
      transform: `scale(${scale}) translateZ(0)`,
    }),
    [scale],
  );

  return (
    <div ref={viewportRef} className={`resume-document-viewport ${className}`}>
      <div className={`resume-document-stage ${stageClassName}`} style={stageStyle}>
        <div className="resume-document-scale" style={documentStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}
