import { SignUp } from "@clerk/react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";
import { portalPath, RESIDENT_DASHBOARD_ROUTE } from "@/lib/portal-paths";

type InviteInfo =
  | { state: "none" }
  | { state: "loading" }
  | { state: "valid"; email: string; unitNumber: string }
  | { state: "invalid"; reason: string };

export default function SignUpPage() {
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const [invite, setInvite] = useState<InviteInfo>({ state: "none" });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    // Persist across Clerk's sign-up redirect so the post-sign-up sync can
    // consume the single-use token server-side.
    sessionStorage.setItem("hoa_invite_token", token);
    setInvite({ state: "loading" });
    fetch(`${import.meta.env.BASE_URL}api/invitations/validate?token=${encodeURIComponent(token)}`, { credentials: "include" })
      .then(res => res.json())
      .then((data: { valid: boolean; email?: string; unitNumber?: string; reason?: string }) => {
        if (data.valid && data.email) {
          setInvite({ state: "valid", email: data.email, unitNumber: data.unitNumber ?? "" });
        } else {
          setInvite({ state: "invalid", reason: data.reason ?? "not_found" });
        }
      })
      .catch(() => setInvite({ state: "invalid", reason: "error" }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 gap-4">
      {invite.state === "valid" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 max-w-md w-full text-sm text-green-800">
          <p className="font-medium">{T("signup_invite_banner_title")}</p>
          <p className="text-xs mt-1">
            {T("signup_invite_banner_body")} <span className="font-semibold">{displayUnitReference(invite.unitNumber)}</span>.{" "}
            {T("signup_invite_use_email")} <span className="font-semibold" dir="ltr">{invite.email}</span>
          </p>
        </div>
      )}
      {invite.state === "invalid" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-md w-full text-sm text-amber-800">
          <p className="font-medium">{T("signup_invite_invalid_title")}</p>
          <p className="text-xs mt-1">
            {invite.reason === "used" ? T("signup_invite_invalid_used")
              : invite.reason === "revoked" ? T("signup_invite_invalid_revoked")
              : invite.reason === "expired" ? T("signup_invite_invalid_expired")
              : T("signup_invite_invalid_generic")}
          </p>
        </div>
      )}
      <SignUp
        routing="path"
        path={portalPath("/sign-up")}
        signInUrl={portalPath("/sign-in")}
        fallbackRedirectUrl={portalPath(RESIDENT_DASHBOARD_ROUTE)}
        {...(invite.state === "valid" ? { initialValues: { emailAddress: invite.email } } : {})}
      />
    </div>
  );
}
