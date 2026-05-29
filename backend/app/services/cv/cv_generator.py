"""
DEPRECATED: PDF generation has been moved to the frontend (html2pdf).

The backend no longer renders, generates, or converts CV documents.
This module is intentionally empty and exists only as a placeholder so
that any stale imports fail loudly with an ImportError instead of
silently invoking removed logic.

If you reach this module, update your code to:
  - Generate the PDF on the frontend using html2pdf.js
  - Upload the resulting blob to POST /upload-cv
"""

from __future__ import annotations

__all__: list[str] = []
