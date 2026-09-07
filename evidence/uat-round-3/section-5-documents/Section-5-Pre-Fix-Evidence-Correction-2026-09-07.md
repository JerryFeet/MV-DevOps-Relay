# Section 5 pre-fix evidence correction

The file `Section-5-Pre-Fix-FAIL-5e-Edit-View-Only-Persistence-2026-09-07.png`
was initially labeled as a product failure. That label was incorrect.

The document card was absent because the browser test reloaded the Documents
page without reselecting its run-scoped custom folder. After the test reselected
that folder, the existing pre-Section-5 edit-to-view-only behavior passed. No
product change to edit persistence was needed.

The screenshot is retracted from the accepted failure set. The valid pre-fix
failures are:

1. Native-browser PDF rendering.
2. Folder-level download/view-only default controls.
3. A per-document view-only choice being overwritten when a custom folder was
   selected afterward.

The raw pre-fix output remains published for auditability and must be read with
this correction.