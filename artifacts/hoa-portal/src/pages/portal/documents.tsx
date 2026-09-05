import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getApiBase, getAuthToken, apiRequest } from "@/lib/api";
import { useRef, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, BookOpen, Download, Trash2, FolderOpen, Loader2, Edit, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import {
  useListDocuments,
  useListDocumentFolders,
  useCreateDocumentFolder,
  useUpdateDocumentFolder,
  useCreateDocument,
  type DocumentVisibility,
  type DocumentDownloadMode,
} from "@workspace/api-client-react";

export function openViewOnlyDocumentTarget(): Window | null {
  const target = window.open("", "_blank");
  if (target) target.opener = null;
  return target;
}

export function triggerDocumentDownload(objectUrl: string, title: string): void {
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = title;
  link.hidden = true;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
}

type PreviewKind = "pdf" | "docx" | "image";

function getPreviewKind(mimeType: string | null | undefined): PreviewKind | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mimeType?.startsWith("image/")) return "image";
  return null;
}

function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMimeLabel(mimeType: string | null | undefined): string | null {
  if (!mimeType) return null;
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) {
    const sub = mimeType.split("/")[1]?.toUpperCase();
    return sub === "JPEG" ? "JPG" : (sub ?? "Image");
  }
  if (mimeType.includes("word")) return "Word";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "Excel";
  const ext = mimeType.split("/")[1];
  return ext ? ext.toUpperCase() : null;
}

export default function DocumentsPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);

  const isAdmin = user?.role === "admin";
  const documentQueryScope = user?.id ?? "signed-out";
  const { data: documents, isLoading: docsLoading } = useListDocuments({
    query: { queryKey: ["/api/documents", documentQueryScope] },
  });
  const { data: folders, isLoading: foldersLoading } = useListDocumentFolders({
    query: { queryKey: ["/api/document-folders", documentQueryScope] },
  });

  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);

  // Folder Dialog
  const [folderOpen, setFolderOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [folderForm, setFolderForm] = useState({
    name: "",
    nameAr: "",
    defaultVisibility: "all_portal_users" as DocumentVisibility,
    defaultDownloadMode: "download_allowed" as DocumentDownloadMode,
    sortOrder: 0,
    isActive: true,
  });

  // Doc Dialog
  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({
    title: "",
    folderId: 0,
    fileUrl: "",
    description: "",
    mimeType: "",
    fileSize: 0,
    visibility: "all_portal_users" as DocumentVisibility,
    downloadMode: "download_allowed" as DocumentDownloadMode,
  });

  const [adminFile, setAdminFile] = useState<File | null>(null);
  const [adminUploading, setAdminUploading] = useState(false);
  const adminFileRef = useRef<HTMLInputElement>(null);
  const adminUploadGenRef = useRef(0);
  const [manageOpen, setManageOpen] = useState(false);
  const [managedDocument, setManagedDocument] = useState<any>(null);
  const [replacementPath, setReplacementPath] = useState("");
  const [replacementMimeType, setReplacementMimeType] = useState("");
  const [replacementFileSize, setReplacementFileSize] = useState(0);
  const [manageUploading, setManageUploading] = useState(false);
  const manageFileRef = useRef<HTMLInputElement>(null);
  const managedDocumentIdRef = useRef<number | null>(null);
  const manageUploadGenRef = useRef(0);
  const [manageForm, setManageForm] = useState({
    title: "", description: "", folderId: 0,
    visibility: "all_portal_users" as DocumentVisibility,
    downloadMode: "download_allowed" as DocumentDownloadMode,
  });
  const [preview, setPreview] = useState<{
    title: string;
    kind: PreviewKind;
    loading: boolean;
    objectUrl?: string;
    html?: string;
    error?: string;
  } | null>(null);

  const createFolder = useCreateDocumentFolder();
  const updateFolder = useUpdateDocumentFolder();
  const createDocument = useCreateDocument();

  const deleteMutation = {
    mutate: async (id: number) => {
      try {
        await apiRequest(`/documents/${id}`, { method: "DELETE" });
        qc.invalidateQueries({ queryKey: ["/api/documents"] });
      } catch (e: any) {
        toast({ title: "Error", description: e.message || "Failed to delete document", variant: "destructive" });
      }
    }
  };

  // Computed state
  const visibleFolders = useMemo(() => {
    if (!folders) return [];
    let list = folders;
    if (!isAdmin) {
      list = list.filter((f: any) => f.isActive && !f.isTriage && f.documentCount > 0);
    }
    return list.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  }, [folders, isAdmin]);

  // Set the default active folder after rendering; this is state synchronization,
  // not a value calculation.
  useEffect(() => {
    if (!activeFolderId && visibleFolders.length > 0) {
      setActiveFolderId(visibleFolders[0].id);
    }
  }, [activeFolderId, visibleFolders]);

  const activeFolderDocs = useMemo(() => {
    if (!documents || !activeFolderId) return [];
    return documents.filter((d: any) => d.folder.id === activeFolderId);
  }, [documents, activeFolderId]);

  function closePreview() {
    if (preview?.objectUrl) URL.revokeObjectURL(preview.objectUrl);
    setPreview(null);
  }

  async function openDocument(document: { id: number; title: string; canDownload: boolean; mimeType?: string | null }) {
    const listedKind = getPreviewKind(document.mimeType);
    if (!document.canDownload && listedKind) {
      setPreview({ title: document.title, kind: listedKind, loading: true });
    }
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getApiBase()}/api/documents/${document.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.error === "DOCUMENT_OBJECT_NOT_FOUND") throw new Error(T("doc_missing_object"));
        throw new Error(body?.message || body?.error || T("doc_open_error"));
      }
      const responseKind = listedKind ?? getPreviewKind(response.headers.get("content-type"));
      if (document.canDownload) {
        const objectUrl = URL.createObjectURL(await response.blob());
        triggerDocumentDownload(objectUrl, document.title);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else if (!responseKind) {
        throw new Error(T("doc_preview_unsupported"));
      } else if (responseKind === "docx") {
        // The API converts view-only DOCX files to HTML. Sandbox it so the
        // preview never receives portal privileges.
        setPreview({ title: document.title, kind: responseKind, loading: false, html: await response.text() });
      } else {
        setPreview({ title: document.title, kind: responseKind, loading: false, objectUrl: URL.createObjectURL(await response.blob()) });
      }
    } catch (error: any) {
      setPreview(current => current ? { ...current, loading: false, error: error?.message ?? T("doc_open_error") } : current);
      toast({ title: T("common_error"), description: error?.message ?? "Unable to open this document.", variant: "destructive" });
    }
  }

  async function handleAdminFileUpload(file: File) {
    const gen = ++adminUploadGenRef.current;
    setAdminUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await apiRequest("/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (adminUploadGenRef.current !== gen) return;
      setAdminFile(file);
      setDocForm(f => ({ ...f, fileUrl: result.objectPath, mimeType: result.mimeType, fileSize: result.fileSize }));
    } catch (e: any) {
      if (adminUploadGenRef.current !== gen) return;
      toast({ title: T("docs_upload_error"), description: e.message, variant: "destructive" });
    } finally {
      if (adminUploadGenRef.current === gen) {
        setAdminUploading(false);
      }
    }
  }

  async function handleReplacementFileUpload(file: File) {
    const documentId = managedDocumentIdRef.current;
    const generation = manageUploadGenRef.current;
    if (!documentId) return;
    setManageUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest("/documents/upload", { method: "POST", body: formData });
      if (
        manageUploadGenRef.current === generation
        && managedDocumentIdRef.current === documentId
      ) {
        setReplacementPath(result.objectPath);
        setReplacementMimeType(result.mimeType);
        setReplacementFileSize(result.fileSize);
      }
    } catch (error: any) {
      if (manageUploadGenRef.current === generation) {
        toast({ title: T("docs_upload_error"), description: error?.message, variant: "destructive" });
      }
    } finally {
      if (manageUploadGenRef.current === generation) setManageUploading(false);
    }
  }

  function handleFolderSubmit() {
    if (editingFolderId) {
      updateFolder.mutate(
        { id: editingFolderId, data: folderForm },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["/api/document-folders"] });
            setFolderOpen(false);
          },
        }
      );
    } else {
      const payload = {
        name: folderForm.name,
        nameAr: folderForm.nameAr,
        defaultVisibility: folderForm.defaultVisibility,
        defaultDownloadMode: folderForm.defaultDownloadMode,
        sortOrder: folderForm.sortOrder,
      };
      createFolder.mutate(
        { data: payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["/api/document-folders"] });
            setFolderOpen(false);
          },
        }
      );
    }
  }

  function handleDocSubmit() {
    createDocument.mutate(
      { data: docForm },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/documents"] });
          setDocOpen(false);
          setAdminFile(null);
          setDocForm({ title: "", folderId: 0, fileUrl: "", description: "", mimeType: "", fileSize: 0, visibility: "all_portal_users", downloadMode: "download_allowed" });
          toast({ title: T("doc_save_document") });
        },
      }
    );
  }

  function openFolderDialog(f?: any) {
    if (f) {
      setEditingFolderId(f.id);
      setFolderForm({
        name: f.name,
        nameAr: f.nameAr,
        defaultVisibility: f.defaultVisibility,
        defaultDownloadMode: f.defaultDownloadMode,
        sortOrder: f.sortOrder,
        isActive: f.isActive,
      });
    } else {
      setEditingFolderId(null);
      setFolderForm({
        name: "",
        nameAr: "",
        defaultVisibility: "all_portal_users",
        defaultDownloadMode: "download_allowed",
        sortOrder: 0,
        isActive: true,
      });
    }
    setFolderOpen(true);
  }

  function openDocDialog() {
    adminUploadGenRef.current += 1;
    setAdminFile(null);
    setAdminUploading(false);
    setDocForm({
      title: "",
      folderId: activeFolderId || (folders && folders[0]?.id) || 0,
      fileUrl: "",
      description: "",
      mimeType: "",
      fileSize: 0,
      visibility: "all_portal_users",
      downloadMode: "download_allowed",
    });
    setDocOpen(true);
  }

  function openManageDialog(document: any) {
    manageUploadGenRef.current += 1;
    managedDocumentIdRef.current = document.id;
    setManagedDocument(document);
    setReplacementPath("");
    setReplacementMimeType("");
    setReplacementFileSize(0);
    setManageForm({
      title: document.title,
      description: document.description ?? "",
      folderId: document.folder.id,
      visibility: document.visibility,
      downloadMode: document.downloadMode,
    });
    setManageOpen(true);
  }

  function closeManageDialog() {
    manageUploadGenRef.current += 1;
    managedDocumentIdRef.current = null;
    setManageOpen(false);
    setManagedDocument(null);
    setReplacementPath("");
    setReplacementMimeType("");
    setReplacementFileSize(0);
    setManageUploading(false);
  }

  async function saveManagedDocument() {
    if (!managedDocument) return;
    try {
      if (replacementPath) {
        await apiRequest(`/documents/${managedDocument.id}/replace`, {
          method: "POST",
          body: JSON.stringify({
            ...manageForm,
            fileUrl: replacementPath,
            mimeType: replacementMimeType,
            fileSize: replacementFileSize,
          }),
        });
      } else {
        await apiRequest(`/documents/${managedDocument.id}`, {
          method: "PATCH",
          body: JSON.stringify(manageForm),
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      qc.invalidateQueries({ queryKey: ["/api/document-folders"] });
      closeManageDialog();
      toast({ title: T("doc_save_document") });
    } catch (error: any) {
      toast({ title: T("common_error"), description: error?.message, variant: "destructive" });
    }
  }

  const isLoading = docsLoading || foldersLoading;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">{T("doc_title")}</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openFolderDialog()}>
              <Plus className="h-4 w-4 me-2" /> {T("doc_add_folder")}
            </Button>
            <Button onClick={() => openDocDialog()}>
              <Plus className="h-4 w-4 me-2" /> {T("doc_add")}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Sidebar / Top Nav for Folders */}
          <div className="w-full md:w-64 shrink-0 space-y-2">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider px-3 mb-3">
              {T("doc_folders")}
            </h2>
            {visibleFolders.length === 0 ? null : (
              visibleFolders.map((f: any) => (
                <div key={f.id} className="group relative">
                  <button
                    onClick={() => setActiveFolderId(f.id)}
                    className={`w-full text-start px-3 py-2 rounded-md text-sm transition-colors ${
                      activeFolderId === f.id
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <FolderOpen className={`h-4 w-4 shrink-0 ${activeFolderId === f.id ? "text-blue-500" : "text-slate-400"}`} />
                        <span className="truncate">{lang === "ar" ? f.nameAr : f.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 ms-2 shrink-0">{f.documentCount}</span>
                    </div>
                  </button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1/2 -translate-y-1/2 end-1 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFolderDialog(f);
                      }}
                    >
                      <Edit className="h-4 w-4 text-slate-400" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Main Docs List */}
          <div className="flex-1 w-full min-w-0">
            {visibleFolders.length === 0 || activeFolderDocs.length === 0 ? (
              <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{T("doc_no_docs")}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {activeFolderDocs.map((d: any) => (
                  <div
                    key={d.id}
                    data-testid="doc-card"
                    className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-4 hover:border-slate-300 transition-colors"
                  >
                    <BookOpen className="h-8 w-8 text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm truncate">{d.title}</span>
                        {isAdmin && d.visibility === "admin_only" && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{T("doc_vis_admin")}</span>}
                        {isAdmin && d.visibility === "verified_owners" && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{T("doc_vis_owners")}</span>}
                      </div>
                      {d.description && <p className="text-slate-500 text-xs mt-1 truncate">{d.description}</p>}
                      <p className="text-slate-400 text-xs mt-1 flex items-center gap-1.5 flex-wrap">
                        {d.canDownload ? <Download className="h-3 w-3 shrink-0" /> : <EyeOff className="h-3 w-3 shrink-0" />}
                        {d.downloadMode === "view_only" ? T("doc_dl_view") : T("doc_dl_allowed")}
                        <span aria-hidden>·</span>
                        {formatMimeLabel(d.mimeType) && (
                          <>
                            <span className="font-medium text-slate-500">{formatMimeLabel(d.mimeType)}</span>
                            <span aria-hidden>·</span>
                          </>
                        )}
                        {formatFileSize(d.fileSize) && <span>{formatFileSize(d.fileSize)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button onClick={() => openDocument(d)} size="sm" variant={d.canDownload ? "outline" : "secondary"} className="gap-2">
                        {d.canDownload ? (
                          <><Download className="h-4 w-4" /> {T("doc_download")}</>
                        ) : (
                          <><Eye className="h-4 w-4" /> {T("doc_view")}</>
                        )}
                      </Button>
                      {isAdmin && (
                        <Button size="icon" variant="ghost" onClick={() => openManageDialog(d)} aria-label={T("doc_edit")}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteMutation.mutate(d.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={open => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>
          <div className="min-h-[60vh]" data-testid="document-preview">
            {preview?.loading && (
              <div className="flex h-[60vh] items-center justify-center text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {preview?.error && (
              <div className="flex h-[60vh] items-center justify-center text-center text-sm text-red-700" role="alert" data-testid="document-preview-error">
                {preview.error}
              </div>
            )}
            {!preview?.loading && !preview?.error && preview?.kind === "pdf" && preview.objectUrl && (
              <iframe title={preview.title} src={preview.objectUrl} className="h-[70vh] w-full border-0" data-testid="document-pdf-preview" />
            )}
            {!preview?.loading && !preview?.error && preview?.kind === "image" && preview.objectUrl && (
              <img src={preview.objectUrl} alt={preview.title} className="mx-auto max-h-[70vh] max-w-full object-contain" data-testid="document-image-preview" />
            )}
            {!preview?.loading && !preview?.error && preview?.kind === "docx" && preview.html && (
              <iframe title={preview.title} srcDoc={preview.html} sandbox="" className="h-[70vh] w-full border-0 bg-white" data-testid="document-docx-preview" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Folder Dialog */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFolderId ? T("doc_edit_folder") : T("doc_add_folder")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{T("doc_folder_name")}</Label>
                <Input value={folderForm.name} onChange={e => setFolderForm(f => ({ ...f, name: e.target.value }))} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{T("doc_folder_name_ar")}</Label>
                <Input value={folderForm.nameAr} onChange={e => setFolderForm(f => ({ ...f, nameAr: e.target.value }))} dir="rtl" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{T("doc_folder_visibility")}</Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={folderForm.defaultVisibility} onChange={e => setFolderForm(f => ({ ...f, defaultVisibility: e.target.value as DocumentVisibility }))}>
                <option value="all_portal_users">{T("doc_vis_all")}</option>
                <option value="verified_owners">{T("doc_vis_owners")}</option>
                <option value="admin_only">{T("doc_vis_admin")}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>{T("doc_folder_download")}</Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={folderForm.defaultDownloadMode} onChange={e => setFolderForm(f => ({ ...f, defaultDownloadMode: e.target.value as DocumentDownloadMode }))}>
                <option value="download_allowed">{T("doc_dl_allowed")}</option>
                <option value="view_only">{T("doc_dl_view")}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>{T("doc_folder_sort")}</Label>
              <Input type="number" value={folderForm.sortOrder} onChange={e => setFolderForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
            </div>

            {editingFolderId && (
              <div className="flex items-center gap-2 py-2">
                <Switch checked={folderForm.isActive} onCheckedChange={v => setFolderForm(f => ({ ...f, isActive: v }))} />
                <Label className={!folderForm.isActive ? "text-red-500" : ""}>{folderForm.isActive ? T("doc_folder_active") : T("doc_folder_archive")}</Label>
              </div>
            )}

            <Button
              className="w-full mt-4"
              onClick={handleFolderSubmit}
              disabled={createFolder.isPending || updateFolder.isPending || !folderForm.name.trim() || !folderForm.nameAr.trim()}
            >
              {(createFolder.isPending || updateFolder.isPending) ? T("common_loading") : T("doc_save_folder")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Document Dialog */}
      <Dialog open={docOpen} onOpenChange={v => {
        setDocOpen(v);
        if (!v) {
          adminUploadGenRef.current += 1; // cancel inflight
          setAdminFile(null);
          setAdminUploading(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{T("doc_add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[80vh] overflow-y-auto px-1">
            <div className="space-y-1.5">
              <Label>{T("doc_field_title")}</Label>
              <Input value={docForm.title} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>{T("doc_field_folder")}</Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={docForm.folderId} onChange={e => {
                const folderId = parseInt(e.target.value);
                const folder = folders?.find((item: any) => item.id === folderId);
                setDocForm(f => ({
                  ...f,
                  folderId,
                  visibility: folder?.defaultVisibility ?? f.visibility,
                  downloadMode: folder?.defaultDownloadMode ?? f.downloadMode,
                }));
              }}>
                <option value={0} disabled>Select folder...</option>
                {folders?.map((f: any) => (
                  <option key={f.id} value={f.id}>{lang === "ar" ? f.nameAr : f.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>{T("doc_field_description")} {T("optional")}</Label>
              <Input value={docForm.description} onChange={e => setDocForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>{T("doc_upload_pick")}</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0"
                  disabled={adminUploading}
                  onClick={() => adminFileRef.current?.click()}>
                  <FolderOpen className="h-4 w-4" />
                  {adminUploading ? T("doc_uploading") : T("doc_upload")}
                </Button>
                <span className="text-sm text-slate-500 truncate" dir="ltr">
                  {adminFile ? adminFile.name : T("doc_upload_no_file")}
                </span>
              </div>
              <input ref={adminFileRef} type="file" className="hidden"
                accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAdminFileUpload(f); e.target.value = ""; }}
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <Label>{T("doc_field_visibility")}</Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={docForm.visibility} onChange={e => setDocForm(f => ({ ...f, visibility: e.target.value as DocumentVisibility }))}>
                <option value="all_portal_users">{T("doc_vis_all")}</option>
                <option value="verified_owners">{T("doc_vis_owners")}</option>
                <option value="admin_only">{T("doc_vis_admin")}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>{T("doc_field_download_mode")}</Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={docForm.downloadMode} onChange={e => setDocForm(f => ({ ...f, downloadMode: e.target.value as DocumentDownloadMode }))}>
                <option value="download_allowed">{T("doc_dl_allowed")}</option>
                <option value="view_only">{T("doc_dl_view")}</option>
              </select>
            </div>

            {docForm.downloadMode === "view_only" && (
              <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-xs flex gap-2 items-start mt-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{T("doc_view_only_warning")}</p>
              </div>
            )}

            <Button
              className="w-full mt-2"
              onClick={handleDocSubmit}
              disabled={createDocument.isPending || adminUploading || !docForm.title.trim() || !docForm.fileUrl || !docForm.folderId}
            >
              {adminUploading
                ? <><Loader2 className="h-4 w-4 animate-spin me-2 inline" />{T("doc_uploading")}</>
                : createDocument.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin me-2 inline" />{T("common_loading")}</>
                  : T("doc_save_document")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin document management: replacement creates a new current record;
          archived predecessors are never exposed in this interface. */}
      <Dialog open={manageOpen} onOpenChange={(open) => open ? setManageOpen(true) : closeManageDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T("doc_edit")}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[80vh] overflow-y-auto px-1">
            <div className="space-y-1.5">
              <Label>{T("doc_field_title")}</Label>
              <Input value={manageForm.title} onChange={e => setManageForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{T("doc_field_description")} {T("optional")}</Label>
              <Input value={manageForm.description} onChange={e => setManageForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{T("doc_field_folder")}</Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={manageForm.folderId} onChange={e => {
                const folderId = parseInt(e.target.value);
                const folder = folders?.find((item: any) => item.id === folderId);
                setManageForm(f => ({ ...f, folderId, visibility: folder?.defaultVisibility ?? f.visibility, downloadMode: folder?.defaultDownloadMode ?? f.downloadMode }));
              }}>
                {folders?.filter((folder: any) => folder.isActive).map((folder: any) => (
                  <option key={folder.id} value={folder.id}>{lang === "ar" ? folder.nameAr : folder.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{T("doc_field_visibility")}</Label>
                <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={manageForm.visibility} onChange={e => setManageForm(f => ({ ...f, visibility: e.target.value as DocumentVisibility }))}>
                  <option value="all_portal_users">{T("doc_vis_all")}</option>
                  <option value="verified_owners">{T("doc_vis_owners")}</option>
                  <option value="admin_only">{T("doc_vis_admin")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{T("doc_field_download_mode")}</Label>
                <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm" value={manageForm.downloadMode} onChange={e => setManageForm(f => ({ ...f, downloadMode: e.target.value as DocumentDownloadMode }))}>
                  <option value="download_allowed">{T("doc_dl_allowed")}</option>
                  <option value="view_only">{T("doc_dl_view")}</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{T("common_click_change")}</Label>
              <Button type="button" variant="outline" onClick={() => manageFileRef.current?.click()} disabled={manageUploading}>
                {manageUploading ? T("doc_uploading") : replacementPath ? T("doc_upload_no_file") : T("doc_upload_pick")}
              </Button>
              <input ref={manageFileRef} type="file" className="hidden" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                onChange={e => { const file = e.target.files?.[0]; if (file) handleReplacementFileUpload(file); e.target.value = ""; }} />
              {replacementPath && <p className="text-xs text-slate-500">A new current record will replace this document.</p>}
            </div>
            {manageForm.downloadMode === "view_only" && <p className="text-xs text-amber-800 bg-amber-50 rounded-md p-3">{T("doc_view_only_warning")}</p>}
            <Button className="w-full" onClick={saveManagedDocument} disabled={!manageForm.title.trim() || !manageForm.folderId || manageUploading}>
              {T("doc_save_document")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
