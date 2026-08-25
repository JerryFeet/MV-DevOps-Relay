# Go-Live Workbook walkthrough — Section D (Expo mobile app)

**Browser capability:** confirmed. The Expo web build rendered at the Expo-specific preview host in a 402×874 browser viewport.

**Observed screen:** the signed-out Madain Village mobile sign-in screen rendered Email, Password, Sign In, Google, and Sign up controls.  
**Screenshot:** `screenshots/section-d/mobile-web-entry.jpg`

## Returned to manual

All D1–D8 remain manual. The mobile app’s signed-in flow uses email/password or Google. The development Clerk browser fixture is passwordless and does not establish a session in this Expo web client without interacting with the real sign-in UI. No API response was substituted for a mobile walkthrough.

This preserves the required boundary:

- **D1–D6:** need an authenticated mobile browser/device session.
- **D7:** needs a signed-in form sweep; no camera/photo control was inferred from API or source alone.
- **D8:** needs signed-in screens in Arabic. Browser rendering can support it once authentication is available; native device orientation and secure-storage/push behavior remain device-only.
