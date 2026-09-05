import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/api";
import { Show } from "@clerk/react";
import { ChevronRight, Shield, CheckCircle, Globe, ChevronDown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { useState } from "react";

// Plus Code RQGJ+V8 Al Munsiyah, Riyadh resolves to the full Open Location
// Code 7HP8RQGJ+V8. These are the exact centre coordinates of that code cell.
export const MADAIN_VILLAGE_LOCATION = {
  latitude: 24.8271875,
  longitude: 46.7808125,
  plusCode: "7HP8RQGJ+V8",
} as const;

const MADAIN_MAP_QUERY = `${MADAIN_VILLAGE_LOCATION.latitude},${MADAIN_VILLAGE_LOCATION.longitude}`;
export const MADAIN_MAP_EMBED_URL =
  `https://maps.google.com/maps?q=${MADAIN_MAP_QUERY}&output=embed&z=17&hl=en`;
export const MADAIN_MAP_DIRECTIONS_URL =
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MADAIN_MAP_QUERY)}`;

function LegalAccordionItem({
  title,
  children,
  isAr,
}: {
  title: string;
  children: React.ReactNode;
  isAr: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#2a4a48] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-[#c4a882] hover:text-white hover:bg-[#1a3a38] transition-colors text-left ${isAr ? "flex-row-reverse" : ""}`}
      >
        <span>{title}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`px-5 pb-5 pt-1 text-xs text-[#9aad9a] leading-relaxed space-y-3 ${isAr ? "text-right" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}

function LegalFooter({ lang }: { lang: "en" | "ar" }) {
  const isAr = lang === "ar";
  const year = new Date().getFullYear();

  return (
    <section className="bg-[#0d2b29] py-12 px-6" dir={isAr ? "rtl" : "ltr"}>
      <div className="max-w-4xl mx-auto">
        <p className="text-center text-[#8a6832] text-xs font-semibold tracking-widest uppercase mb-6">
          {isAr ? "الوثائق القانونية" : "Legal Documents"}
        </p>
        <div className="space-y-3">

          {/* ── Terms of Use ── */}
          <LegalAccordionItem title={isAr ? "شروط الاستخدام" : "Terms of Use"} isAr={isAr}>
            {isAr ? (
              <>
                <p className="text-[#c4a882] font-semibold">تاريخ السريان: يناير {year}</p>
                <p>تحكم هذه الشروط استخدام بوابة جمعية ملاك مدائن فيلدج ("البوابة") المشغَّلة من قِبَل جمعية ملاك مدائن فيلدج، الرياض، المملكة العربية السعودية.</p>
                <p className="font-semibold text-[#c4a882] pt-1">1. القبول</p>
                <p>يُعدّ استخدامك للبوابة قبولاً صريحاً لهذه الشروط. إن لم توافق عليها، فيُرجى التوقف عن الاستخدام فوراً والتواصل معنا.</p>
                <p className="font-semibold text-[#c4a882] pt-1">2. الأهلية</p>
                <p>البوابة مخصصة للملاك والمستأجرين المسجَّلين في مجمع مدائن فيلدج، ومن يمثّلهم من أفراد الأسرة أو المفوَّضين رسمياً.</p>
                <p className="font-semibold text-[#c4a882] pt-1">3. الاستخدام المقبول</p>
                <p>تلتزم باستخدام البوابة للأغراض المشروعة المتعلقة بالجمعية حصراً. يُحظر الوصول غير المصرَّح به أو نشر محتوى ضار أو الإفصاح عن بيانات اعتماد تسجيل الدخول.</p>
                <p className="font-semibold text-[#c4a882] pt-1">4. دقة المعلومات</p>
                <p>تتحمّل مسؤولية صحة جميع المعلومات التي تُقدّمها، بما فيها بيانات الوحدة والمركبة والضيوف.</p>
                <p className="font-semibold text-[#c4a882] pt-1">5. الملكية الفكرية</p>
                <p>جميع محتويات البوابة ملكٌ حصري لجمعية ملاك مدائن فيلدج ومحميةٌ بموجب قوانين الملكية الفكرية في المملكة العربية السعودية. يُحظر نسخها أو توزيعها دون إذن كتابي مسبق.</p>
                <p className="font-semibold text-[#c4a882] pt-1">6. تحديد المسؤولية</p>
                <p>لا تتحمّل الجمعية المسؤولية عن أي أضرار ناجمة عن انقطاع الخدمة أو أخطاء في البيانات، وذلك في حدود ما يجيزه النظام السعودي.</p>
                <p className="font-semibold text-[#c4a882] pt-1">7. التعديلات</p>
                <p>يحق للجمعية تعديل هذه الشروط في أي وقت. يُعدّ استمرار استخدام البوابة بعد نشر التعديلات قبولاً ضمنياً بها.</p>
                <p className="font-semibold text-[#c4a882] pt-1">8. القانون الحاكم</p>
                <p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وتختص المحاكم السعودية بالفصل في أي نزاع.</p>
                <p className="pt-2">للاستفسار: <a href="mailto:Info@madainvillagehoa.com" className="text-[#E27A2F] hover:underline">Info@madainvillagehoa.com</a></p>
              </>
            ) : (
              <>
                <p className="text-[#c4a882] font-semibold">Effective Date: January {year}</p>
                <p>These Terms of Use ("Terms") govern your access to and use of the Madain Village Homeowners Association Portal ("Portal"), operated by the Madain Village HOA, Riyadh, Kingdom of Saudi Arabia.</p>
                <p className="font-semibold text-[#c4a882] pt-1">1. Acceptance</p>
                <p>By accessing or using the Portal you agree to be bound by these Terms. If you do not agree, please discontinue use immediately and contact us.</p>
                <p className="font-semibold text-[#c4a882] pt-1">2. Eligibility</p>
                <p>The Portal is intended solely for registered owners, tenants, and authorised household representatives of Madain Village compound.</p>
                <p className="font-semibold text-[#c4a882] pt-1">3. Acceptable Use</p>
                <p>You agree to use the Portal only for lawful HOA-related purposes. Unauthorised access, uploading harmful content, and sharing login credentials are strictly prohibited.</p>
                <p className="font-semibold text-[#c4a882] pt-1">4. Accuracy of Information</p>
                <p>You are responsible for the accuracy of all information you submit, including unit details, vehicle registrations, and guest pre-registrations.</p>
                <p className="font-semibold text-[#c4a882] pt-1">5. Intellectual Property</p>
                <p>All Portal content is the exclusive property of Madain Village HOA and is protected under Saudi intellectual property laws. Reproduction or distribution without prior written consent is prohibited.</p>
                <p className="font-semibold text-[#c4a882] pt-1">6. Limitation of Liability</p>
                <p>To the maximum extent permitted by applicable Saudi law, the HOA shall not be liable for damages arising from service interruptions, data errors, or third-party actions on the Portal.</p>
                <p className="font-semibold text-[#c4a882] pt-1">7. Amendments</p>
                <p>We reserve the right to update these Terms at any time. Continued use of the Portal after changes are posted constitutes your acceptance of the revised Terms.</p>
                <p className="font-semibold text-[#c4a882] pt-1">8. Governing Law</p>
                <p>These Terms are governed by the laws of the Kingdom of Saudi Arabia. Any disputes shall be subject to the exclusive jurisdiction of the competent Saudi courts.</p>
                <p className="pt-2">Contact: <a href="mailto:Info@madainvillagehoa.com" className="text-[#E27A2F] hover:underline">Info@madainvillagehoa.com</a></p>
              </>
            )}
          </LegalAccordionItem>

          {/* ── Privacy Statement ── */}
          <LegalAccordionItem title={isAr ? "بيان الخصوصية" : "Privacy Statement"} isAr={isAr}>
            {isAr ? (
              <>
                <p className="text-[#c4a882] font-semibold">تاريخ السريان: يناير {year}</p>
                <p>تلتزم جمعية ملاك مدائن فيلدج بحماية بياناتك الشخصية وفق نظام حماية البيانات الشخصية السعودي (PDPL) الصادر بالمرسوم الملكي رقم م/19 وتعديلاته.</p>
                <p className="font-semibold text-[#c4a882] pt-1">1. البيانات التي نجمعها</p>
                <p>نجمع: الاسم الكامل، رقم الوحدة، رقم الهوية الوطنية، معلومات التواصل، بيانات المركبات (الماركة والطراز واللون ورقم اللوحة)، بيانات الضيوف المسجَّلين مسبقاً، تاريخ الحجوزات، طلبات تصاريح التجديد ونماذج الانتقال، والمراسلات مع الجمعية.</p>
                <p className="font-semibold text-[#c4a882] pt-1">2. أغراض الاستخدام</p>
                <p>نستخدم بياناتك لإدارة خدمات الجمعية وحجوزات المرافق ومنح الدخول عبر البوابة الأمنية، وضمان الامتثال للوائح المجمع، والتواصل معك بشأن الشؤون المتعلقة بالجمعية.</p>
                <p className="font-semibold text-[#c4a882] pt-1">3. الأساس القانوني</p>
                <p>تستند معالجة بياناتك إلى موافقتك وتنفيذ التزاماتنا التعاقدية معك، فضلاً عن المصلحة المشروعة في إدارة المجمع وفق أنظمة المملكة العربية السعودية.</p>
                <p className="font-semibold text-[#c4a882] pt-1">4. مشاركة البيانات</p>
                <p>لا نبيع بياناتك أو نؤجّرها. قد نشاركها مع موظفي الجمعية المفوَّضين، وفريق أمن البوابة، ومزودي الخدمات الملتزمين بالسرية التامة، أو حين يقتضي ذلك النظام السعودي.</p>
                <p className="font-semibold text-[#c4a882] pt-1">5. الاحتفاظ بالبيانات</p>
                <p>نحتفظ ببياناتك طوال فترة سكنك، وخمس (5) سنوات بعدها للوفاء بالمتطلبات القانونية والمالية، إلا إذا أوجب النظام مدة أطول.</p>
                <p className="font-semibold text-[#c4a882] pt-1">6. حقوقك</p>
                <p>يمنحك نظام PDPL الحق في: الوصول إلى بياناتك، وتصحيحها، وطلب حذفها، والاعتراض على معالجتها، وطلب نقلها. لممارسة أي من هذه الحقوق، تواصل معنا عبر البريد الإلكتروني أدناه.</p>
                <p className="font-semibold text-[#c4a882] pt-1">7. التخزين ونقل البيانات</p>
                <p>تُخزَّن بياناتك داخل المملكة العربية السعودية. لا يتم نقلها خارجياً إلا وفق الضوابط والاشتراطات التي يحددها نظام حماية البيانات الشخصية.</p>
                <p className="font-semibold text-[#c4a882] pt-1">8. الأمان</p>
                <p>نطبّق ضوابط تقنية وتنظيمية لحماية بياناتك من الوصول غير المصرَّح به أو الفقدان أو الإتلاف.</p>
                <p className="font-semibold text-[#c4a882] pt-1">9. التعديلات</p>
                <p>قد نُحدّث هذا البيان بما يتوافق مع التغييرات التنظيمية أو التشغيلية، وسنُبلّغك بأي تعديلات جوهرية عبر البوابة.</p>
                <p className="pt-2">طلبات الخصوصية والاستفسارات: <a href="mailto:Info@madainvillagehoa.com" className="text-[#E27A2F] hover:underline">Info@madainvillagehoa.com</a></p>
                <p className="text-[#6a7a6a]">الجهة المشرفة: الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا) — <a href="https://sdaia.gov.sa" target="_blank" rel="noopener noreferrer" className="text-[#E27A2F] hover:underline">sdaia.gov.sa</a></p>
              </>
            ) : (
              <>
                <p className="text-[#c4a882] font-semibold">Effective Date: January {year}</p>
                <p>Madain Village Homeowners Association is committed to protecting your personal data in accordance with the Saudi Personal Data Protection Law (PDPL), issued by Royal Decree No. M/19 and its amendments, administered by the Saudi Data & Artificial Intelligence Authority (SDAIA).</p>
                <p className="font-semibold text-[#c4a882] pt-1">1. Data We Collect</p>
                <p>We collect: full name, unit number, national ID number, contact details, vehicle information (make, model, colour, plate number), pre-registered guest records, facility booking history, renovation permit applications, move-in/out forms, and communications submitted through the Portal.</p>
                <p className="font-semibold text-[#c4a882] pt-1">2. How We Use Your Data</p>
                <p>Your data is used to manage HOA services, process facility bookings, grant gate access, ensure compliance with compound regulations, and communicate with you on HOA-related matters.</p>
                <p className="font-semibold text-[#c4a882] pt-1">3. Legal Basis</p>
                <p>Processing is based on your consent, performance of our contractual obligations with you, and the legitimate interests of managing the compound in accordance with Saudi regulations.</p>
                <p className="font-semibold text-[#c4a882] pt-1">4. Data Sharing</p>
                <p>We do not sell or rent your data. We may share it with authorised HOA staff, gate security personnel, and service providers bound by confidentiality obligations, or where required by Saudi law.</p>
                <p className="font-semibold text-[#c4a882] pt-1">5. Retention</p>
                <p>We retain your data for the duration of your residency and for five (5) years thereafter to meet legal and financial obligations, unless a longer period is required by applicable law.</p>
                <p className="font-semibold text-[#c4a882] pt-1">6. Your Rights</p>
                <p>Under PDPL you have the right to: access your personal data, correct inaccuracies, request erasure, object to processing, and request data portability. To exercise any right, contact us at the email below.</p>
                <p className="font-semibold text-[#c4a882] pt-1">7. Storage & Transfer</p>
                <p>Your data is stored within the Kingdom of Saudi Arabia. Cross-border transfers, if any, are conducted in accordance with the conditions and controls stipulated by PDPL.</p>
                <p className="font-semibold text-[#c4a882] pt-1">8. Security</p>
                <p>We apply technical and organisational controls to protect your data against unauthorised access, loss, or destruction.</p>
                <p className="font-semibold text-[#c4a882] pt-1">9. Updates</p>
                <p>We may update this Statement in line with regulatory or operational changes. Material updates will be communicated through the Portal.</p>
                <p className="pt-2">Privacy requests & enquiries: <a href="mailto:Info@madainvillagehoa.com" className="text-[#E27A2F] hover:underline">Info@madainvillagehoa.com</a></p>
                <p className="text-[#6a7a6a]">Supervisory authority: Saudi Data & Artificial Intelligence Authority (SDAIA) — <a href="https://sdaia.gov.sa" target="_blank" rel="noopener noreferrer" className="text-[#E27A2F] hover:underline">sdaia.gov.sa</a></p>
              </>
            )}
          </LegalAccordionItem>

        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { lang, setLang } = useLanguage();
  const T = (key: string) => t(lang, key);

  const { data: announcementsResult } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["announcements", "public"],
    queryFn: () => apiRequest("/announcements?isPublic=true"),
  });
  const announcements = announcementsResult?.data ?? [];

  const MISSION_ITEMS = [
    T("mission_1"),
    T("mission_2"),
    T("mission_3"),
    T("mission_4"),
    T("mission_5"),
    T("mission_6"),
  ];

  const CORE_VALUES = [
    { name: T("val_unity"),          desc: T("val_unity_desc") },
    { name: T("val_transparency"),   desc: T("val_transparency_desc") },
    { name: T("val_preservation"),   desc: T("val_preservation_desc") },
    { name: T("val_accountability"), desc: T("val_accountability_desc") },
    { name: T("val_pragmatism"),     desc: T("val_pragmatism_desc") },
    { name: T("val_respect"),        desc: T("val_respect_desc") },
  ];

  const SERVICES: { label: string; comingSoon?: boolean; href?: string }[] = [
    { label: T("svc_facility_booking") },
    { label: T("svc_permits") },
    { label: T("svc_documents") },
    { label: T("svc_guests") },
    { label: T("svc_vehicles") },
    { label: T("svc_residents") },
    { label: T("svc_announcements") },
  ];

  return (
    <div className="min-h-screen bg-white">

      {/* ── Header ── */}
      <header className="bg-[#0F4442] text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-wider uppercase">MADAIN Village</span>
            <span className="text-[10px] text-[#c4a882] tracking-wide mt-0.5">{T("home_tagline")}</span>
          </div>
          <nav className="flex items-center gap-4 md:gap-6">
            <a href="#vision" className="hidden md:block text-[#d4b880] hover:text-white text-sm transition-colors">{T("home_nav_vision")}</a>
            <a href="#values" className="hidden md:block text-[#d4b880] hover:text-white text-sm transition-colors">{T("home_nav_values")}</a>
            <a href="#services" className="hidden md:block text-[#d4b880] hover:text-white text-sm transition-colors">{T("home_nav_services")}</a>
            <a href="#location" className="hidden md:block text-[#d4b880] hover:text-white text-sm transition-colors">{T("home_nav_location")}</a>
            <a href="#contact" className="hidden md:block text-[#d4b880] hover:text-white text-sm transition-colors">{lang === "ar" ? "تواصل" : "Contact"}</a>

            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex items-center gap-1.5 text-xs font-medium text-[#d4b880] hover:text-white border border-[#d4b880]/40 hover:border-white/60 px-2.5 py-1.5 rounded-lg transition-colors"
              aria-label="Toggle language"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === "en" ? "عربي" : "EN"}
            </button>

            <Show when="signed-in">
              <Link href="/portal" className="bg-[#E27A2F] hover:bg-[#c56a1a] text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
                {T("home_go_portal")}
              </Link>
            </Show>
            <Show when="signed-out">
              <Link href="/sign-in" className="bg-[#E27A2F] hover:bg-[#c56a1a] text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
                {T("home_resident_login")}
              </Link>
            </Show>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="text-white py-28 px-6"
        style={{ background: "linear-gradient(135deg, #0F4442 0%, #B45A19 100%)" }}
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-3 leading-tight">
            MADAIN Village
          </h1>
          <p className="text-[#d4b880] text-xl mb-4">{T("home_tagline")}</p>
          <p className="text-[#d4b880] text-base max-w-2xl mb-10 leading-relaxed">
            {T("home_subtitle")}
          </p>
          <Show when="signed-out">
            <div className="flex gap-4 flex-wrap">
              <Link
                href="/sign-in"
                className="bg-[#E27A2F] hover:bg-[#c56a1a] text-white px-7 py-3 rounded-lg font-semibold transition-colors"
              >
                {T("home_sign_in")}
              </Link>
              <Link
                href="/sign-up"
                className="border border-white/30 hover:border-white/70 text-white px-7 py-3 rounded-lg font-semibold transition-colors"
              >
                {T("home_create_account")}
              </Link>
            </div>
          </Show>
          <Show when="signed-in">
            <Link
              href="/portal"
              className="bg-[#E27A2F] hover:bg-[#c56a1a] text-white px-7 py-3 rounded-lg font-semibold transition-colors inline-block"
            >
              {T("home_go_to_portal")}
            </Link>
          </Show>
        </div>
      </section>

      {/* ── Compound Photo ── */}
      <section className="relative w-full overflow-hidden" style={{ maxHeight: "520px" }}>
        <img
          src="/compound.png"
          alt="MADAIN Village compound aerial view"
          className="w-full object-cover object-center"
          style={{ maxHeight: "520px" }}
        />
        <div
          className="absolute inset-0 flex items-end"
          style={{ background: "linear-gradient(to top, rgba(15,68,66,0.72) 0%, transparent 55%)" }}
        >
          <div className="px-8 pb-8">
            <p className="text-white text-lg font-semibold leading-tight">MADAIN Village</p>
            <p className="text-[#C9A84C] text-sm mt-0.5">Al Munisiyah · Riyadh · KSA</p>
          </div>
        </div>
      </section>

      {/* ── Vision & Mission ── */}
      <section id="vision" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#E27A2F] text-xs font-semibold tracking-widest uppercase mb-2">{T("home_our_purpose")}</p>
            <h2 className="text-3xl font-bold text-[#0F4442]">{T("home_vision_mission")}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-10 items-start">
            <div className="bg-[#0F4442] rounded-2xl p-8 text-white h-full">
              <p className="text-[#C9A84C] text-xs font-semibold tracking-widest uppercase mb-4">{T("home_our_vision")}</p>
              <p className="text-[#fdf4e8] text-base leading-relaxed">
                {T("home_vision_text")}
              </p>
            </div>
            <div>
              <p className="text-[#C9A84C] text-xs font-semibold tracking-widest uppercase mb-5">
                {T("home_our_mission")}
              </p>
              <ul className="space-y-4">
                {MISSION_ITEMS.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-[#E27A2F] shrink-0 mt-0.5" />
                    <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Core Values ── */}
      <section id="values" className="py-20 px-6 bg-[#faf7f2]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#E27A2F] text-xs font-semibold tracking-widest uppercase mb-2">{T("home_what_guides")}</p>
            <h2 className="text-3xl font-bold text-[#0F4442]">{T("home_core_values")}</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CORE_VALUES.map(({ name, desc }) => (
              <div
                key={name}
                className="bg-white rounded-xl p-6 border-l-4 border-[#E27A2F] shadow-sm hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold text-[#0F4442] mb-2">{name}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section id="services" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#E27A2F] text-xs font-semibold tracking-widest uppercase mb-2">{T("home_resident_portal")}</p>
            <h2 className="text-3xl font-bold text-[#0F4442]">{T("home_resident_services")}</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVICES.map(({ label, comingSoon, href }) => {
              const inner = (
                <>
                  <ChevronRight className="h-4 w-4 text-[#E27A2F] shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  <span className="text-sm text-slate-700 font-medium flex-1">{label}</span>
                  {comingSoon && (
                    <span className="text-[9px] font-semibold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full border border-amber-200 shrink-0 whitespace-nowrap">
                      {T("svc_coming_soon")}
                    </span>
                  )}
                </>
              );
              return href ? (
                <Link
                  key={label}
                  href={href}
                  className="group p-4 rounded-xl border border-slate-200 hover:border-[#B45A19] hover:bg-[#fdf4e8] transition-all flex items-center gap-3 cursor-pointer"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={label}
                  className="group p-4 rounded-xl border border-slate-200 hover:border-[#B45A19] hover:bg-[#fdf4e8] transition-all flex items-center gap-3 cursor-default"
                >
                  {inner}
                </div>
              );
            })}
          </div>
          <div className="text-center mt-10">
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="bg-[#E27A2F] hover:bg-[#c56a1a] text-white px-7 py-3 rounded-lg font-semibold transition-colors"
              >
                {T("home_access_services")}
              </Link>
            </Show>
          </div>
        </div>
      </section>

      {/* ── Announcements (conditional) ── */}
      {announcements && announcements.length > 0 && (
        <section className="py-16 px-6 bg-[#faf7f2]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F4442] mb-6">{T("home_latest_announcements")}</h2>
            <div className="space-y-4">
              {announcements.slice(0, 3).map((a: any) => (
                <div
                  key={a.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#B45A19]/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-[#0F4442]">
                        {lang === "ar" && a.titleAr ? a.titleAr : a.title}
                      </h3>
                      <p className="text-slate-600 text-sm mt-1 line-clamp-2">
                        {lang === "ar" && a.bodyArabic ? a.bodyArabic : a.body}
                      </p>
                    </div>
                    {a.pinned && (
                      <span className="text-xs bg-[#E27A2F]/10 text-[#E27A2F] px-2.5 py-1 rounded-full shrink-0 font-medium border border-[#E27A2F]/20">
                        {T("home_pinned")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Location / Map ── */}
      <section id="location" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#E27A2F] text-xs font-semibold tracking-widest uppercase mb-2">{T("home_where_we_are")}</p>
            <h2 className="text-3xl font-bold text-[#0F4442]">{T("home_find_us")}</h2>
            <p className="text-slate-500 text-sm mt-2">
              {T("home_address")}
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200" style={{ height: "420px" }}>
            <iframe
              title="MADAIN Village location"
              src={MADAIN_MAP_EMBED_URL}
              width="100%"
              height="100%"
              style={{ border: 0, display: "block" }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="text-center mt-6">
            <a
              href={MADAIN_MAP_DIRECTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#0F4442] hover:text-[#E27A2F] transition-colors font-medium"
            >
              {T("home_open_maps")}
            </a>
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="py-20 px-6 bg-[#faf7f2]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#E27A2F] text-xs font-semibold tracking-widest uppercase mb-2">
              {lang === "ar" ? "تواصل معنا" : "Get In Touch"}
            </p>
            <h2 className="text-3xl font-bold text-[#0F4442]">
              {lang === "ar" ? "معلومات التواصل" : "Contact Information"}
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
              <div className="w-12 h-12 bg-[#0F4442]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="h-6 w-6 text-[#0F4442]" />
              </div>
              <p className="text-xs font-semibold text-[#E27A2F] tracking-widest uppercase mb-1">
                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
              </p>
              <a
                href="mailto:Info@madainvillagehoa.com"
                className="text-[#0F4442] hover:text-[#E27A2F] font-medium transition-colors"
              >
                Info@madainvillagehoa.com
              </a>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
              <div className="w-12 h-12 bg-[#0F4442]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-6 w-6 text-[#0F4442]" />
              </div>
              <p className="text-xs font-semibold text-[#E27A2F] tracking-widest uppercase mb-1">
                {lang === "ar" ? "العنوان" : "Address"}
              </p>
              <p className="text-[#0F4442] font-medium text-sm leading-relaxed">
                {T("home_address")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Legal Documents ── */}
      <LegalFooter lang={lang} />

      {/* ── Footer ── */}
      <footer className="bg-[#081f1e] text-[#8a6832] py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs">
            © {new Date().getFullYear()} MADAIN Village{" "}
            {lang === "ar"
              ? "جمعية ملاك المنازل. جميع الحقوق محفوظة."
              : "Homeowners Association. All rights reserved."}
          </p>
        </div>
      </footer>

    </div>
  );
}
