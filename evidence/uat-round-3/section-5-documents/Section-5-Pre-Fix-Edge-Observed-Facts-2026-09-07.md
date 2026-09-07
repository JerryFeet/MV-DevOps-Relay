# Round 3 Section 5 — pre-fix Microsoft Edge observed facts

**Source:** owner-supplied real Microsoft Edge screenshot  
**Journey:** signed-in resident, Document Library, view-only PDF  
**Document title:** `Test view only`

## Observed

- The portal's in-page document preview dialog is open.
- The dialog itself remains rendered and titled correctly.
- The embedded PDF content region is replaced by Microsoft Edge's
  blocked-content icon.
- The failure is therefore inside the existing preview dialog's embedded PDF
  path, not a popup or new-tab path.
- No private resident information is visible in the evidence.

## Pre-fix implementation path

The portal fetches protected PDF bytes, creates a browser `blob:` object URL,
and assigns that object URL to an iframe inside the preview dialog. Native PDF
iframe handling is browser-dependent; the supplied Edge evidence shows this
path does not render the protected PDF.

## Required correction boundary

View-only PDF, Word, and image content must render in the portal on all
supported browsers. The corrected PDF path must not depend on a browser's
native PDF iframe/plugin behavior.