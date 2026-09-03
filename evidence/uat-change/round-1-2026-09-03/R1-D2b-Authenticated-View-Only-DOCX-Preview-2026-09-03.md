# Round 1 D-2b — Authenticated View-Only DOCX Preview

Date: 2026-09-03  
Environment: Development  
Production/Publish: Not performed

## Defect and implementation

Browsers cannot render raw DOCX bytes in an iframe. For a non-admin opening a view-only DOCX, the API now converts the stored DOCX to HTML server-side and returns the HTML preview. Download-enabled documents continue to return their original bytes.

## Access-path audit

- The portal requests `/api/documents/:id/download` with the signed-in user's bearer token.
- The route requires authentication, resolves the application user, and applies document/folder visibility before reading storage.
- Document list and detail responses omit `fileUrl`; residents do not receive the private object path.
- The API fetches the original private object server-side. It does not redirect to storage and does not return a signed or direct object URL.
- The portal creates a browser-local `blob:` URL from the authenticated API response. That URL is not an object-storage URL and is scoped to the browser session.
- For a resident opening a view-only DOCX, the original DOCX bytes are consumed by the server-side converter and only HTML is returned.
- No resident-facing application route returns the original view-only DOCX. Administrators retain the existing original-file access needed to manage documents.
- Legacy external document URLs are rejected and require administrator re-upload to private storage.

View-only remains a deterrent rather than DRM: visible content can still be photographed, screenshotted, or extracted from rendered HTML. The change does not make the original DOCX easier to retrieve.

## Response protections

The converted response uses authenticated delivery, `private, no-store`, same-origin framing, MIME sniffing protection, restrictive content security policy, and print-suppression styling.

Focused portal tests and API/portal type checks passed after the change. This is development evidence, not production approval.