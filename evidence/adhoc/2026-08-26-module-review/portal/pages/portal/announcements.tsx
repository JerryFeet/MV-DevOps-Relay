import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { PaginationBar } from "@/components/PaginationBar";
import { useState, useCallback, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import {
  Plus, Pin, Megaphone, Sparkles, Pencil, Trash2, Link2,
  Bold, Italic, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Undo, Redo, Lock, Globe, Clock, CheckCircle2, FileText, ChevronDown,
  Loader2, AlertCircle, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnnouncementTemplate {
  id: string;
  name: string;
  bodyHtml: string;
  bodyArabic: string;
}

interface AiSuggestion {
  optimized: string;
  translated: string;
  titleAr: string;
}

interface AnnouncementRecord {
  id: number;
  title: string;
  titleAr: string;
  body: string;
  bodyHtml: string;
  bodyArabic: string;
  visibility: "all_portal_users" | "verified_owners_admin";
  pinned: boolean;
  status: "draft" | "published" | "deleted";
  isExpired: boolean;
  authorName: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// ─── Rich Text Toolbar ────────────────────────────────────────────────────────

function RichTextToolbar({ editor }: { editor: any }) {
  if (!editor) return null;
  const btn = (active: boolean) =>
    `p-1.5 rounded text-sm transition-colors ${active ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:bg-slate-100"}`;

  return (
    <div className="flex flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 rounded-t-lg">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} title="Bold"><Bold className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} title="Italic"><Italic className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline?.().run()} className={btn(editor.isActive("underline"))} title="Underline"><span className="text-xs font-medium underline px-0.5">U</span></button>
      <div className="w-px bg-slate-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} title="Heading"><span className="text-xs font-bold px-0.5">H2</span></button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))} title="Subheading"><span className="text-xs font-bold px-0.5">H3</span></button>
      <div className="w-px bg-slate-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title="Bullet list"><List className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></button>
      <div className="w-px bg-slate-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btn(editor.isActive({ textAlign: "left" }))} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btn(editor.isActive({ textAlign: "center" }))} title="Align center"><AlignCenter className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={btn(editor.isActive({ textAlign: "right" }))} title="Align right"><AlignRight className="h-3.5 w-3.5" /></button>
      <div className="w-px bg-slate-200 mx-1" />
      <button
        type="button"
        onClick={() => {
          if (editor.isActive("link")) { editor.chain().focus().unsetLink().run(); return; }
          const prev = editor.getAttributes("link").href ?? "";
          const url = window.prompt("Enter URL", prev);
          if (url === null) return;
          if (url === "") { editor.chain().focus().unsetLink().run(); return; }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        className={btn(editor.isActive("link"))} title="Insert / edit link"
      ><Link2 className="h-3.5 w-3.5" /></button>
      <div className="w-px bg-slate-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} title="Undo"><Undo className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} title="Redo"><Redo className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ─── Announcement Composer (Create & Edit) ────────────────────────────────────

interface ComposerProps {
  existing?: AnnouncementRecord;
  onClose: () => void;
}

export function AnnouncementComposer({ existing, onClose }: ComposerProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!existing;

  // Form state
  const [title, setTitle] = useState(existing?.title ?? "");
  const [titleAr, setTitleAr] = useState(existing?.titleAr ?? "");
  const [bodyArabic, setBodyArabic] = useState(existing?.bodyArabic ?? "");
  const [visibility, setVisibility] = useState<"all_portal_users" | "verified_owners_admin">(existing?.visibility ?? "all_portal_users");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [expiresAt, setExpiresAt] = useState(
    existing?.expiresAt ? new Date(existing.expiresAt).toISOString().slice(0, 10) : ""
  );
  const [isMaterialChange, setIsMaterialChange] = useState(false);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const { data: templates } = useQuery<AnnouncementTemplate[]>({
    queryKey: ["announcement-templates"],
    queryFn: () => apiRequest("/announcements/templates"),
  });

  // AI suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [aiSourceLang, setAiSourceLang] = useState<"en" | "ar">("en");
  const [aiRunning, setAiRunning] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-sky-600 underline", rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: existing?.bodyHtml ?? "",
    editorProps: {
      attributes: { class: "min-h-[140px] px-3 py-2 text-sm text-slate-800 focus:outline-none prose prose-sm max-w-none" },
    },
  });

  // Apply template
  const applyTemplate = (t: AnnouncementTemplate) => {
    editor?.commands.setContent(t.bodyHtml);
    setBodyArabic(t.bodyArabic);
    setSelectedTemplate(t.id);
    setShowTemplates(false);
  };

  // AI Optimize & Translate
  const handleAiSuggest = async () => {
    const sourceText = aiSourceLang === "en"
      ? (editor?.getText() ?? "").trim()
      : bodyArabic.trim();
    if (!sourceText) {
      toast({ title: `Write some ${aiSourceLang === "en" ? "English" : "Arabic"} text first`, variant: "destructive" });
      return;
    }
    setAiRunning(true);
    setAiSuggestion(null);
    try {
      const result = await apiRequest("/announcements/ai-suggest", {
        method: "POST",
        body: JSON.stringify({ sourceText, sourceLang: aiSourceLang, title: aiSourceLang === "en" ? title.trim() : "" }),
      });
      setAiSuggestion(result);
    } catch {
      toast({ title: "AI suggestion failed", variant: "destructive" });
    } finally {
      setAiRunning(false);
    }
  };

  const acceptOptimized = () => {
    if (!aiSuggestion) return;
    if (aiSourceLang === "en") {
      editor?.commands.setContent(`<p>${aiSuggestion.optimized.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`);
    } else {
      setBodyArabic(aiSuggestion.optimized);
    }
    setAiSuggestion(prev => prev ? { ...prev, optimized: "" } : null);
    toast({ title: "Optimized text applied" });
  };

  const acceptTranslated = () => {
    if (!aiSuggestion) return;
    if (aiSourceLang === "en") {
      setBodyArabic(aiSuggestion.translated);
    } else {
      editor?.commands.setContent(`<p>${aiSuggestion.translated.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`);
    }
    setAiSuggestion(prev => prev ? { ...prev, translated: "" } : null);
    toast({ title: "Translation applied" });
  };

  const acceptTitleAr = () => {
    if (!aiSuggestion?.titleAr) return;
    setTitleAr(aiSuggestion.titleAr);
    setAiSuggestion(prev => prev ? { ...prev, titleAr: "" } : null);
  };

  // Validation
  const bodyHtml = editor?.getHTML() ?? "";
  const bodyText = editor?.getText() ?? "";
  const canPublish = title.trim() && titleAr.trim() && bodyText.trim() && bodyArabic.trim();

  const submitPayload = (status: "draft" | "published") => ({
    title, titleAr,
    body: bodyText,
    bodyHtml,
    bodyArabic,
    visibility, pinned, status,
    expiresAt: expiresAt || null,
    ...(isEdit && { isMaterialChange, changeSummary: null }),
  });

  const createMutation = useMutation({
    mutationFn: (status: "draft" | "published") =>
      apiRequest("/announcements", { method: "POST", body: JSON.stringify(submitPayload(status)) }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: status === "draft" ? "Draft saved" : "Announcement published" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (status: "draft" | "published") =>
      apiRequest(`/announcements/${existing!.id}`, { method: "PATCH", body: JSON.stringify(submitPayload(status)) }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: status === "draft" ? "Draft updated" : "Announcement updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const submit = (status: "draft" | "published") =>
    isEdit ? updateMutation.mutate(status) : createMutation.mutate(status);

  return (
    <div className="space-y-4 max-h-[82vh] overflow-y-auto pe-1">

      {/* ── Template Picker ── */}
      <div>
        <Label className="mb-1.5 block">Start from a template</Label>
        <button
          type="button"
          onClick={() => setShowTemplates(v => !v)}
          className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            {selectedTemplate
              ? templates?.find(t => t.id === selectedTemplate)?.name ?? "Template selected"
              : "Blank — start from scratch"}
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showTemplates ? "rotate-180" : ""}`} />
        </button>
        {showTemplates && (
          <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => { setSelectedTemplate(null); setShowTemplates(false); }}
              className="w-full px-3 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50 border-b border-slate-100"
            >Blank</button>
            {templates?.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0"
              >{t.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Arabic Title ── */}
      <div>
        <Label className="mb-1 block flex items-center gap-1.5">
          Arabic Title <span className="text-slate-400 font-normal text-xs">(right-to-left)</span>
          {!titleAr.trim() && <span className="text-amber-500 text-xs ms-1">Required to publish</span>}
        </Label>
        <Input
          dir="rtl"
          lang="ar"
          placeholder="عنوان الإعلان..."
          value={titleAr}
          onChange={e => setTitleAr(e.target.value)}
          className="text-right"
          style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}
        />
      </div>

      {/* ── English Title ── */}
      <div>
        <Label className="mb-1 block">
          English Title
          {!title.trim() && <span className="text-amber-500 text-xs ms-2">Required to publish</span>}
        </Label>
        <Input
          placeholder="Announcement title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* ── AI Optimize & Translate ── */}
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-violet-700 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI Optimize &amp; Translate
          </p>
          <div className="flex rounded-md border border-violet-300 overflow-hidden text-xs">
            <button type="button" onClick={() => { setAiSourceLang("en"); setAiSuggestion(null); }}
              className={`px-2.5 py-1 transition-colors ${aiSourceLang === "en" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-100"}`}>
              EN → AR
            </button>
            <button type="button" onClick={() => { setAiSourceLang("ar"); setAiSuggestion(null); }}
              className={`px-2.5 py-1 transition-colors ${aiSourceLang === "ar" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-100"}`}>
              AR → EN
            </button>
          </div>
        </div>
        <Button
          type="button" size="sm" variant="outline"
          onClick={handleAiSuggest} disabled={aiRunning}
          className="w-full border-violet-300 text-violet-700 hover:bg-violet-100"
        >
          {aiRunning ? <><Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" /> Generating suggestions…</> : "Optimize & Translate"}
        </Button>

        {/* Suggestion side-panel */}
        {aiSuggestion && (
          <div className="space-y-2">
            {aiSuggestion.titleAr && (
              <div className="rounded-md border border-amber-200 bg-white p-3 space-y-2">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Arabic Title</p>
                <p className="text-sm text-slate-700 text-right" dir="rtl"
                  style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}>
                  {aiSuggestion.titleAr}
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={acceptTitleAr}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7 px-3">
                    <CheckCircle2 className="h-3 w-3 me-1" /> Use as Arabic Title
                  </Button>
                  <Button type="button" size="sm" variant="ghost"
                    onClick={() => setAiSuggestion(p => p ? { ...p, titleAr: "" } : null)}
                    className="text-xs h-7 px-3 text-slate-500">
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            {aiSuggestion.optimized && (
              <div className="rounded-md border border-violet-200 bg-white p-3 space-y-2">
                <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">
                  Optimized {aiSourceLang === "en" ? "English" : "Arabic"}
                </p>
                <p className={`text-sm text-slate-700 whitespace-pre-wrap ${aiSourceLang === "ar" ? "text-right" : ""}`}
                  dir={aiSourceLang === "ar" ? "rtl" : "ltr"}
                  style={aiSourceLang === "ar" ? { fontFamily: "'Noto Sans Arabic', Arial, sans-serif" } : undefined}>
                  {aiSuggestion.optimized}
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={acceptOptimized}
                    className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 px-3">
                    <CheckCircle2 className="h-3 w-3 me-1" /> Accept
                  </Button>
                  <Button type="button" size="sm" variant="ghost"
                    onClick={() => setAiSuggestion(p => p ? { ...p, optimized: "" } : null)}
                    className="text-xs h-7 px-3 text-slate-500">
                    Discard
                  </Button>
                </div>
              </div>
            )}
            {aiSuggestion.translated && (
              <div className="rounded-md border border-emerald-200 bg-white p-3 space-y-2">
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                  {aiSourceLang === "en" ? "Arabic Translation" : "English Translation"}
                </p>
                <p className={`text-sm text-slate-700 whitespace-pre-wrap ${aiSourceLang === "en" ? "text-right" : ""}`}
                  dir={aiSourceLang === "en" ? "rtl" : "ltr"}
                  style={aiSourceLang === "en" ? { fontFamily: "'Noto Sans Arabic', Arial, sans-serif" } : undefined}>
                  {aiSuggestion.translated}
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={acceptTranslated}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3">
                    <CheckCircle2 className="h-3 w-3 me-1" /> Accept
                  </Button>
                  <Button type="button" size="sm" variant="ghost"
                    onClick={() => setAiSuggestion(p => p ? { ...p, translated: "" } : null)}
                    className="text-xs h-7 px-3 text-slate-500">
                    Discard
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Arabic Body ── */}
      <div>
        <Label className="mb-1 block flex items-center gap-1.5">
          Arabic Text <span className="text-slate-400 font-normal text-xs">(right-to-left)</span>
          {!bodyArabic.trim() && <span className="text-amber-500 text-xs ms-1">Required to publish</span>}
        </Label>
        <Textarea
          rows={5} dir="rtl" lang="ar"
          placeholder="النص العربي هنا..."
          value={bodyArabic}
          onChange={e => setBodyArabic(e.target.value)}
          className="text-right font-arabic text-base leading-relaxed"
          style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}
        />
      </div>

      {/* ── English Body ── */}
      <div>
        <Label className="mb-1 block">
          English Text
          {!bodyText.trim() && <span className="text-amber-500 text-xs ms-2">Required to publish</span>}
        </Label>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <RichTextToolbar editor={editor} />
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* ── Visibility ── */}
      <div>
        <Label className="mb-1.5 block">Visibility</Label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setVisibility("all_portal_users")}
            className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${visibility === "all_portal_users" ? "border-sky-400 bg-sky-50 ring-1 ring-sky-300" : "border-slate-200 hover:bg-slate-50"}`}>
            <Globe className={`h-4 w-4 mt-0.5 shrink-0 ${visibility === "all_portal_users" ? "text-sky-600" : "text-slate-400"}`} />
            <span>
              <span className="block text-sm font-medium text-slate-800">All Residents</span>
              <span className="block text-xs text-slate-500">Owners and tenants</span>
            </span>
          </button>
          <button type="button" onClick={() => setVisibility("verified_owners_admin")}
            className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${visibility === "verified_owners_admin" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-slate-200 hover:bg-slate-50"}`}>
            <Lock className={`h-4 w-4 mt-0.5 shrink-0 ${visibility === "verified_owners_admin" ? "text-amber-600" : "text-slate-400"}`} />
            <span>
              <span className="block text-sm font-medium text-slate-800">Owners Only</span>
              <span className="block text-xs text-slate-500">Verified property owners</span>
            </span>
          </button>
        </div>
      </div>

      {/* ── Pin ── */}
      <div className="flex items-center gap-2">
        <Switch checked={pinned} onCheckedChange={setPinned} />
        <Label className="cursor-pointer">Pin to top of feed</Label>
      </div>

      {/* ── Expiry (optional) ── */}
      <div>
        <Label className="mb-1 block flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          Expiry Date <span className="text-slate-400 font-normal text-xs ms-1">— optional; leave blank for no expiry</span>
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            className="max-w-[180px]"
          />
          {expiresAt && (
            <button type="button" onClick={() => setExpiresAt("")}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Material Change toggle (edit only) ── */}
      {isEdit && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 flex items-start gap-3">
          <Switch checked={isMaterialChange} onCheckedChange={setIsMaterialChange} />
          <div>
            <p className="text-sm font-medium text-orange-800">Material change — notify residents</p>
            <p className="text-xs text-orange-600 mt-0.5">Turn on to flag this edit as significant. Email notification will be sent when the email module is enabled.</p>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1"
          onClick={() => submit("published")}
          disabled={isPending || !canPublish}
          title={!canPublish ? "Both Arabic and English titles and body text are required to publish" : undefined}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
          {isEdit ? "Save & Publish" : "Publish"}
        </Button>
        <Button
          variant="outline"
          onClick={() => submit("draft")}
          disabled={isPending}
          className="shrink-0"
        >
          Save Draft
        </Button>
      </div>
      {!canPublish && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5 -mt-2">
          <AlertCircle className="h-3 w-3" />
          Both languages (title + body) are required before publishing.
        </p>
      )}
    </div>
  );
}

// ─── Announcement Card ────────────────────────────────────────────────────────

function AnnouncementCard({
  a, isAdmin, lang, onDelete, onEdit,
}: {
  a: AnnouncementRecord;
  isAdmin: boolean;
  lang: string;
  onDelete: (id: number) => void;
  onEdit: (a: AnnouncementRecord) => void;
}) {
  const hasArabic = a.bodyArabic?.trim();
  const hasHtml = a.bodyHtml?.trim();
  const isDraft = a.status === "draft";

  const formattedDate = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-SA", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(a.createdAt));

  return (
    <div className={`border rounded-xl overflow-hidden shadow-sm ${isDraft ? "border-dashed border-slate-300 bg-white" : a.isExpired ? "border-slate-200 bg-slate-100 opacity-70" : "border-slate-200 bg-white"}`}>
      {/* Card header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {isDraft && (
              <Badge variant="outline" className="text-xs border-slate-300 text-slate-500 bg-slate-50">
                Draft
              </Badge>
            )}
            {a.isExpired && !isDraft && (
              <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 bg-orange-50">
                <Clock className="h-2.5 w-2.5 me-1" /> Expired
              </Badge>
            )}
            {a.pinned && (
              <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                <Pin className="h-3 w-3" /> Pinned
              </span>
            )}
            {a.visibility === "all_portal_users" ? (
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                <Globe className="h-3 w-3" /> All Residents
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                <Lock className="h-3 w-3" /> Owners Only
              </span>
            )}
          </div>

          {/* Arabic title */}
          {a.titleAr?.trim() && (
            <h3 dir="rtl" lang="ar" className="font-semibold text-slate-900 text-base leading-snug text-right"
              style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}>
              {a.titleAr}
            </h3>
          )}
          {/* English title */}
          <h3 className="font-semibold text-slate-900 text-base leading-snug">{a.title}</h3>

          <p className="text-xs text-slate-400 mt-0.5">
            {formattedDate}
            {a.authorName ? <> · <span className="text-slate-500">{a.authorName}</span></> : null}
            {a.expiresAt && (
              <> · <span className={a.isExpired ? "text-slate-400" : "text-orange-500"}>
                {a.isExpired ? "Expired" : "Expires"}{" "}
                {new Date(a.expiresAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA", { day: "numeric", month: "short", year: "numeric" })}
              </span></>
            )}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 mt-0.5 shrink-0">
            <button onClick={() => onEdit(a)}
              className="text-slate-300 hover:text-slate-600 transition-colors p-1" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => onDelete(a.id)}
              className="text-slate-300 hover:text-red-500 transition-colors p-1" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Arabic body — RTL, shown first */}
      {hasArabic && (
        <div dir="rtl" lang="ar"
          className="px-5 py-4 border-b border-slate-100 bg-slate-50 text-right"
          style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}>
          <p className="text-xs font-medium text-slate-400 mb-2 text-right">العربية</p>
          <p className="text-slate-800 text-base leading-relaxed whitespace-pre-wrap">{a.bodyArabic}</p>
        </div>
      )}

      {/* English body */}
      <div className="px-5 py-4">
        {hasArabic && <p className="text-xs font-medium text-slate-400 mb-2">English</p>}
        {hasHtml ? (
          <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />
        ) : (
          <p className="text-slate-700 text-sm whitespace-pre-wrap">{a.body}</p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const { lang } = useLanguage();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnnouncementRecord | null>(null);
  const isAdmin = user?.role === "admin";

  const [page, setPage] = useState(1);
  const PAGE_LIMIT = 50;
  const { data: result, isLoading } = useQuery<{ data: AnnouncementRecord[]; total: number }>({
    queryKey: ["announcements", page],
    queryFn: () => apiRequest(`/announcements?page=${page}&limit=${PAGE_LIMIT}`),
  });
  const announcements = result?.data ?? [];
  const totalPages = Math.ceil((result?.total ?? 0) / PAGE_LIMIT);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Announcement deleted" });
    },
  });

  const drafts = announcements.filter(a => a.status === "draft");
  const published = announcements.filter(a => a.status === "published");

  const openEdit = (a: AnnouncementRecord) => {
    setEditTarget(a);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditTarget(null);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t(lang, "ann_title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{lang === "ar" ? "آخر أخبار جمعية مدائن فيلج" : "Community updates from Madain Village HOA"}</p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={() => { setEditTarget(null); setComposerOpen(true); }}>
            <Plus className="h-4 w-4" /> {t(lang, "ann_new")}
          </Button>
        )}
      </div>

      {/* Composer / Edit dialog */}
      <Dialog open={composerOpen} onOpenChange={open => { if (!open) closeComposer(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-slate-600" />
              {editTarget ? "Edit Announcement" : "New Announcement"}
            </DialogTitle>
          </DialogHeader>
          {composerOpen && (
            <AnnouncementComposer
              key={editTarget?.id ?? "new"}
              existing={editTarget ?? undefined}
              onClose={closeComposer}
            />
          )}
          
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="bg-white border border-slate-200 rounded-xl h-36 animate-pulse" />)}
        </div>
      )}

      {/* Admin: Drafts section */}
      {isAdmin && drafts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Drafts ({drafts.length})
          </h2>
          <div className="space-y-3">
            {drafts.map(a => (
              <AnnouncementCard
                key={a.id} a={a} isAdmin={isAdmin} lang={lang}
                onDelete={id => deleteMutation.mutate(id)}
                onEdit={openEdit}
              />
            ))}
          </div>
          {published.length > 0 && <div className="border-t border-slate-200 mt-6 mb-1" />}
        </div>
      )}

      {/* Published announcements */}
      {!isLoading && published.length === 0 && drafts.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No announcements yet</p>
          {isAdmin && <p className="text-sm mt-1">Click "New Announcement" to post one.</p>}
        </div>
      )}

      <div className="space-y-4">
        {published.map(a => (
          <AnnouncementCard
            key={a.id} a={a} isAdmin={isAdmin} lang={lang}
            onDelete={id => deleteMutation.mutate(id)}
            onEdit={openEdit}
          />
        ))}
      </div>

      <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
