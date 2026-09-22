"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type UiLang = "bg" | "en" | "de";
type ContentLang = "bg" | "en" | "de" | "ro" | "cs" | "ru";
type SourceKind = "manual" | "document";
type Severity = "normal" | "important" | "critical";

type Localized = Partial<Record<ContentLang, string>>;

type ProposalBlock = {
  id: string;
  titleByLang: Localized;
  bodyByLang: Localized;
  severity: Severity;
  tags: string[];
};

type Proposal = {
  titleByLang: Localized;
  roleCodes: string[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  trainingRequired: boolean;
  assessmentRequired: boolean;
  minimumPassScore: number | null;
  blocks: ProposalBlock[];
};

type AuthoringRow = {
  id: string;
  source_kind: SourceKind;
  status: "draft" | "proposal_ready" | "approved" | "published" | "cancelled";
  standard_key: string;
  department_codes: string[];
  source_text: string | null;
  structured_proposal_json: Record<string, any> | null;
  proposal_hash: string | null;
  published_standard_revision_id: string | null;
  updated_at: string;
};

type SourceDocument = {
  id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  created_at: string;
  previewUrl: string;
  textImported?: boolean;
};

const LANGUAGES: Array<{ id: ContentLang; label: string }> = [
  { id: "bg", label: "BG" },
  { id: "en", label: "EN" },
  { id: "de", label: "DE" },
  { id: "ro", label: "RO" },
  { id: "cs", label: "CZ" },
  { id: "ru", label: "RU" },
];

const COPY = {
  bg: {
    title: "Хотелски стандарти",
    intro: "Стандартът идва от хотела. Въведете го ръчно или качете готов PDF, Word или TXT документ. Структурираното предложение се публикува само след преглед от Manager.",
    new: "Нов стандарт",
    sourceManual: "Ръчно",
    sourceDocument: "Документ",
    key: "Ключ на стандарта",
    departments: "Отдели",
    sourceText: "Оригинален текст / източник",
    sourcePlaceholder: "Поставете оригиналния стандарт на хотела тук…",
    create: "Създай чернова",
    drafts: "Чернови и версии",
    select: "Отвори",
    status: "Статус",
    source: "Източник",
    documents: "Документи от хотела",
    upload: "Качи PDF / Word / TXT",
    uploading: "Качване…",
    sourceNote: "PDF/DOCX се пазят като оригинален private source. TXT може автоматично да зареди текста. AI extraction ще използва същия proposal boundary, но няма право да публикува.",
    saveSource: "Запази изходния текст",
    proposal: "Структурирано предложение",
    editLanguage: "Език за редакция",
    standardTitle: "Заглавие",
    effectiveFrom: "В сила от",
    effectiveTo: "В сила до",
    passScore: "Минимален резултат %",
    addBlock: "Добави стъпка / правило",
    blockId: "ID",
    blockTitle: "Заглавие на стъпката",
    blockBody: "Правило / процедура",
    severity: "Важност",
    normal: "Нормално",
    important: "Важно",
    critical: "Критично",
    remove: "Премахни",
    seed: "Създай първи блок от изходния текст",
    saveProposal: "Запази предложение",
    publish: "Одобри и публикувай",
    published: "Публикувано",
    proposalReady: "Готово за преглед",
    draft: "Чернова",
    locked: "Записването е заключено до финалния E2E тест.",
    noDrafts: "Все още няма стандарти в authoring.",
    approvalWarning: "Publish създава нова immutable версия на стандарта и автоматично Training Plan. Това е човешкото одобрение.",
    saved: "Запазено.",
    uploaded: "Документът е качен и хеширан.",
    publishedNotice: "Стандартът и Training Plan са публикувани.",
    error: "Възникна грешка.",
  },
  en: {
    title: "Hotel Standards",
    intro: "The standard comes from the hotel. Enter it manually or upload an existing PDF, Word or TXT document. The structured proposal is published only after Manager review.",
    new: "New standard",
    sourceManual: "Manual",
    sourceDocument: "Document",
    key: "Standard key",
    departments: "Departments",
    sourceText: "Original text / source",
    sourcePlaceholder: "Paste the hotel's original standard here…",
    create: "Create draft",
    drafts: "Drafts and versions",
    select: "Open",
    status: "Status",
    source: "Source",
    documents: "Hotel source documents",
    upload: "Upload PDF / Word / TXT",
    uploading: "Uploading…",
    sourceNote: "PDF/DOCX remain private original sources. TXT may populate source text automatically. AI extraction will use the same proposal boundary and cannot publish.",
    saveSource: "Save source text",
    proposal: "Structured proposal",
    editLanguage: "Editing language",
    standardTitle: "Title",
    effectiveFrom: "Effective from",
    effectiveTo: "Effective to",
    passScore: "Minimum pass score %",
    addBlock: "Add step / rule",
    blockId: "ID",
    blockTitle: "Step title",
    blockBody: "Rule / procedure",
    severity: "Severity",
    normal: "Normal",
    important: "Important",
    critical: "Critical",
    remove: "Remove",
    seed: "Create first block from source text",
    saveProposal: "Save proposal",
    publish: "Approve and publish",
    published: "Published",
    proposalReady: "Ready for review",
    draft: "Draft",
    locked: "Writes are locked until the final E2E test.",
    noDrafts: "No standards in authoring yet.",
    approvalWarning: "Publish creates a new immutable Standard version and Training Plan. This is the human approval step.",
    saved: "Saved.",
    uploaded: "Document uploaded and hashed.",
    publishedNotice: "Standard and Training Plan published.",
    error: "Something went wrong.",
  },
  de: {
    title: "Hotelstandards",
    intro: "Der Standard kommt vom Hotel. Er kann manuell eingegeben oder als vorhandenes PDF-, Word- oder TXT-Dokument hochgeladen werden. Veröffentlicht wird erst nach Manager-Prüfung.",
    new: "Neuer Standard",
    sourceManual: "Manuell",
    sourceDocument: "Dokument",
    key: "Standard-Schlüssel",
    departments: "Abteilungen",
    sourceText: "Originaltext / Quelle",
    sourcePlaceholder: "Originalen Hotelstandard hier einfügen…",
    create: "Entwurf erstellen",
    drafts: "Entwürfe und Versionen",
    select: "Öffnen",
    status: "Status",
    source: "Quelle",
    documents: "Quelldokumente des Hotels",
    upload: "PDF / Word / TXT hochladen",
    uploading: "Wird hochgeladen…",
    sourceNote: "PDF/DOCX bleiben private Originalquellen. TXT kann den Quelltext automatisch übernehmen. KI-Extraktion nutzt dieselbe Proposal-Grenze und darf nicht veröffentlichen.",
    saveSource: "Quelltext speichern",
    proposal: "Strukturierter Vorschlag",
    editLanguage: "Bearbeitungssprache",
    standardTitle: "Titel",
    effectiveFrom: "Gültig ab",
    effectiveTo: "Gültig bis",
    passScore: "Mindestpunktzahl %",
    addBlock: "Schritt / Regel hinzufügen",
    blockId: "ID",
    blockTitle: "Titel des Schritts",
    blockBody: "Regel / Ablauf",
    severity: "Wichtigkeit",
    normal: "Normal",
    important: "Wichtig",
    critical: "Kritisch",
    remove: "Entfernen",
    seed: "Ersten Block aus Quelltext erstellen",
    saveProposal: "Vorschlag speichern",
    publish: "Freigeben und veröffentlichen",
    published: "Veröffentlicht",
    proposalReady: "Zur Prüfung bereit",
    draft: "Entwurf",
    locked: "Schreibzugriffe bleiben bis zum finalen E2E-Test gesperrt.",
    noDrafts: "Noch keine Standards im Authoring.",
    approvalWarning: "Publish erstellt eine neue unveränderliche Standard-Version und automatisch einen Training Plan. Dies ist die menschliche Freigabe.",
    saved: "Gespeichert.",
    uploaded: "Dokument hochgeladen und gehasht.",
    publishedNotice: "Standard und Training Plan wurden veröffentlicht.",
    error: "Ein Fehler ist aufgetreten.",
  },
} as const;

let storageClient: ReturnType<typeof createClient> | null = null;

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("STAFF_STANDARD_SOURCE_STORAGE_CONFIG_MISSING");
  }
  if (!storageClient) {
    storageClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return storageClient;
}

function blankProposal(): Proposal {
  return {
    titleByLang: {},
    roleCodes: [],
    effectiveFrom: null,
    effectiveTo: null,
    trainingRequired: true,
    assessmentRequired: true,
    minimumPassScore: 80,
    blocks: [],
  };
}

function normalizedBlockId(value: string, fallback: number) {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || `step-${fallback}`;
}

function displayStatus(row: AuthoringRow, copy: typeof COPY.bg) {
  if (row.status === "published") return copy.published;
  if (row.status === "proposal_ready") return copy.proposalReady;
  return copy.draft;
}

export default function StaffStandardAuthoringPanel({
  hotelSlug,
  lang,
  writesEnabled,
  operationalRole,
}: {
  hotelSlug: string;
  lang: UiLang;
  writesEnabled: boolean;
  operationalRole: string;
}) {
  const copy = COPY[lang] || COPY.bg;
  const [rows, setRows] = useState<AuthoringRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [sourceKind, setSourceKind] = useState<SourceKind>("manual");
  const [newKey, setNewKey] = useState("");
  const [departmentText, setDepartmentText] = useState(operationalRole);
  const [newSourceText, setNewSourceText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editLanguage, setEditLanguage] = useState<ContentLang>("bg");
  const [proposal, setProposal] = useState<Proposal>(blankProposal());

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  const loadRows = useCallback(async () => {
    const response = await fetch(
      `/api/staff/development/standards/authoring?hotelSlug=${encodeURIComponent(hotelSlug)}`,
      { cache: "no-store", credentials: "same-origin" },
    );
    const body = await response.json().catch(() => null) as any;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "STAFF_STANDARD_AUTHORING_LIST_FAILED");
    }
    const next = (body.authoring || []) as AuthoringRow[];
    setRows(next);
    setSelectedId((current) => current || next[0]?.id || "");
    return next;
  }, [hotelSlug]);

  const loadDocuments = useCallback(async (authoringId: string) => {
    if (!authoringId) {
      setDocuments([]);
      return;
    }
    const response = await fetch(
      `/api/staff/development/standards/source-documents?hotelSlug=${encodeURIComponent(hotelSlug)}&authoringId=${encodeURIComponent(authoringId)}`,
      { cache: "no-store", credentials: "same-origin" },
    );
    const body = await response.json().catch(() => null) as any;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "STAFF_STANDARD_SOURCE_DOCUMENT_LIST_FAILED");
    }
    setDocuments(body.documents || []);
  }, [hotelSlug]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadRows()
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRows]);

  useEffect(() => {
    if (!selected) {
      setSourceText("");
      setProposal(blankProposal());
      setDocuments([]);
      return;
    }

    setSourceText(selected.source_text || "");
    const stored = selected.structured_proposal_json;
    if (stored) {
      setProposal({
        titleByLang: stored.titleByLang || {},
        roleCodes: Array.isArray(stored.roleCodes) ? stored.roleCodes : [],
        effectiveFrom: stored.effectiveFrom || null,
        effectiveTo: stored.effectiveTo || null,
        trainingRequired: stored.trainingRequired !== false,
        assessmentRequired: stored.assessmentRequired !== false,
        minimumPassScore:
          stored.minimumPassScore === null
            ? null
            : Number(stored.minimumPassScore ?? 80),
        blocks: Array.isArray(stored.blocks)
          ? stored.blocks.map((block: any) => ({
              id: String(block.id || ""),
              titleByLang: block.titleByLang || {},
              bodyByLang: block.bodyByLang || {},
              severity: ["normal", "important", "critical"].includes(block.severity)
                ? block.severity
                : "normal",
              tags: Array.isArray(block.tags) ? block.tags : [],
            }))
          : [],
      });
    } else {
      setProposal(blankProposal());
    }

    void loadDocuments(selected.id).catch((reason) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [selectedId, selected?.updated_at, loadDocuments]);

  async function postAuthoring(payload: Record<string, unknown>) {
    const response = await fetch("/api/staff/development/standards/authoring", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelSlug, ...payload }),
    });
    const body = await response.json().catch(() => null) as any;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "STAFF_STANDARD_AUTHORING_FAILED");
    }
    return body.result;
  }

  async function createDraft() {
    if (!writesEnabled) {
      setError(copy.locked);
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const departmentCodes = departmentText
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const result = await postAuthoring({
        action: "create_draft",
        sourceKind,
        standardKey: newKey,
        departmentCodes,
        sourceText: sourceKind === "manual" ? newSourceText : null,
      });
      setNewKey("");
      setNewSourceText("");
      await loadRows();
      setSelectedId(String(result.id));
      setNotice(copy.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  async function saveSource() {
    if (!selected) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await postAuthoring({
        action: "update_source_text",
        authoringId: selected.id,
        sourceText,
      });
      await loadRows();
      setNotice(copy.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  async function uploadDocument() {
    if (!selected || !uploadFile || !writesEnabled) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const prepare = await fetch(
        "/api/staff/development/standards/source-documents",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "prepare",
            hotelSlug,
            authoringId: selected.id,
            originalName: uploadFile.name,
            mimeType: uploadFile.type,
            fileSize: uploadFile.size,
          }),
        },
      );
      const prepared = await prepare.json().catch(() => null) as any;
      if (!prepare.ok || !prepared?.ok || !prepared.upload) {
        throw new Error(prepared?.error || "STAFF_STANDARD_SOURCE_DOCUMENT_PREPARE_FAILED");
      }

      const storage = getStorageClient();
      const { error: uploadError } = await storage.storage
        .from("staff-development-sources")
        .uploadToSignedUrl(
          prepared.upload.storagePath,
          prepared.upload.token,
          uploadFile,
          { contentType: uploadFile.type, cacheControl: "3600" },
        );

      if (uploadError) {
        throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_UPLOAD_FAILED");
      }

      const finalize = await fetch(
        "/api/staff/development/standards/source-documents",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "finalize",
            hotelSlug,
            authoringId: selected.id,
            documentId: prepared.upload.documentId,
            storagePath: prepared.upload.storagePath,
            originalName: uploadFile.name,
            mimeType: uploadFile.type,
            fileSize: uploadFile.size,
          }),
        },
      );
      const finalized = await finalize.json().catch(() => null) as any;
      if (!finalize.ok || !finalized?.ok) {
        throw new Error(finalized?.error || "STAFF_STANDARD_SOURCE_DOCUMENT_FINALIZE_FAILED");
      }

      setUploadFile(null);
      await loadRows();
      await loadDocuments(selected.id);
      setNotice(copy.uploaded);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  function addBlock() {
    setProposal((current) => ({
      ...current,
      blocks: [
        ...current.blocks,
        {
          id: `step-${current.blocks.length + 1}`,
          titleByLang: {},
          bodyByLang: {},
          severity: "normal",
          tags: [],
        },
      ],
    }));
  }

  function seedFromSource() {
    if (!sourceText.trim()) return;
    setProposal((current) => ({
      ...current,
      blocks: current.blocks.length
        ? current.blocks
        : [{
            id: "source-standard",
            titleByLang: {
              [editLanguage]:
                current.titleByLang[editLanguage] || selected?.standard_key || "Standard",
            },
            bodyByLang: { [editLanguage]: sourceText.trim() },
            severity: "important",
            tags: [],
          }],
    }));
  }

  function updateBlock(index: number, mutator: (block: ProposalBlock) => ProposalBlock) {
    setProposal((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) =>
        blockIndex === index ? mutator(structuredClone(block)) : block,
      ),
    }));
  }

  async function saveProposal() {
    if (!selected) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const cleanBlocks = proposal.blocks.map((block, index) => ({
        ...block,
        id: normalizedBlockId(block.id, index + 1),
        tags: block.tags
          .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))
          .filter(Boolean),
      }));
      await postAuthoring({
        action: "save_proposal",
        authoringId: selected.id,
        proposal: {
          ...proposal,
          blocks: cleanBlocks,
        },
      });
      await loadRows();
      setNotice(copy.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  async function publish() {
    if (!selected || selected.status !== "proposal_ready") return;
    if (!window.confirm(copy.approvalWarning)) return;

    setWorking(true);
    setError("");
    setNotice("");
    try {
      await postAuthoring({
        action: "publish",
        authoringId: selected.id,
      });
      await loadRows();
      setNotice(copy.publishedNotice);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-3xl border p-5 shadow-sm" data-staff-standard-authoring="true">
      <div>
        <h3 className="text-lg font-semibold">{copy.title}</h3>
        <p className="mt-1 max-w-4xl text-sm opacity-65">{copy.intro}</p>
      </div>

      {!writesEnabled ? (
        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
          {copy.locked}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border p-4">
            <h4 className="font-semibold">{copy.new}</h4>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSourceKind("manual")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${sourceKind === "manual" ? "bg-black/10" : ""}`}
              >
                {copy.sourceManual}
              </button>
              <button
                type="button"
                onClick={() => setSourceKind("document")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${sourceKind === "document" ? "bg-black/10" : ""}`}
              >
                {copy.sourceDocument}
              </button>
            </div>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-semibold opacity-60">{copy.key}</span>
              <input
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                className="w-full rounded-xl border bg-transparent px-3 py-2"
                placeholder="housekeeping-room-entry"
              />
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-semibold opacity-60">{copy.departments}</span>
              <input
                value={departmentText}
                onChange={(event) => setDepartmentText(event.target.value)}
                className="w-full rounded-xl border bg-transparent px-3 py-2"
                placeholder="housekeeping"
              />
            </label>

            {sourceKind === "manual" ? (
              <textarea
                value={newSourceText}
                onChange={(event) => setNewSourceText(event.target.value)}
                className="mt-3 min-h-40 w-full rounded-xl border bg-transparent p-3 text-sm"
                placeholder={copy.sourcePlaceholder}
              />
            ) : null}

            <button
              type="button"
              disabled={working || !writesEnabled || !newKey.trim()}
              onClick={() => void createDraft()}
              className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {copy.create}
            </button>
          </div>

          <div className="rounded-2xl border p-4">
            <h4 className="font-semibold">{copy.drafts}</h4>
            {loading ? <p className="mt-2 text-sm opacity-60">…</p> : null}
            {!loading && !rows.length ? (
              <p className="mt-2 text-sm opacity-60">{copy.noDrafts}</p>
            ) : null}
            <div className="mt-3 space-y-2">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-xl border p-3 text-left ${selectedId === row.id ? "bg-black/10" : ""}`}
                >
                  <p className="font-semibold">{row.standard_key}</p>
                  <p className="mt-1 text-xs opacity-55">
                    {displayStatus(row, copy as any)} · {row.department_codes.join(", ")}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold">{selected.standard_key}</h4>
                  <p className="text-xs opacity-55">
                    {copy.status}: {displayStatus(selected, copy as any)} · {copy.source}: {selected.source_kind}
                  </p>
                </div>
                {selected.status === "proposal_ready" ? (
                  <button
                    type="button"
                    disabled={working || !writesEnabled}
                    onClick={() => void publish()}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    {copy.publish}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <h4 className="font-semibold">{copy.sourceText}</h4>
              {selected.source_kind === "document" ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                      className="text-sm"
                    />
                    <button
                      type="button"
                      disabled={working || !writesEnabled || !uploadFile || selected.status !== "draft"}
                      onClick={() => void uploadDocument()}
                      className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      {working ? copy.uploading : copy.upload}
                    </button>
                  </div>
                  <p className="mt-2 text-xs opacity-55">{copy.sourceNote}</p>
                  {documents.length ? (
                    <div className="mt-3 space-y-2">
                      {documents.map((document) => (
                        <a
                          key={document.id}
                          href={document.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border p-3 text-sm"
                        >
                          <strong>{document.original_name}</strong>
                          <span className="ml-2 opacity-55">
                            {(Number(document.file_size) / 1024).toFixed(0)} KB
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}

              <textarea
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                disabled={selected.status !== "draft"}
                className="mt-3 min-h-44 w-full rounded-xl border bg-transparent p-3 text-sm disabled:opacity-60"
                placeholder={copy.sourcePlaceholder}
              />
              {selected.status === "draft" ? (
                <button
                  type="button"
                  disabled={working || !writesEnabled || !sourceText.trim()}
                  onClick={() => void saveSource()}
                  className="mt-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  {copy.saveSource}
                </button>
              ) : null}
            </div>

            <div className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="font-semibold">{copy.proposal}</h4>
                <select
                  value={editLanguage}
                  onChange={(event) => setEditLanguage(event.target.value as ContentLang)}
                  className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.id} value={language.id}>{language.label}</option>
                  ))}
                </select>
              </div>

              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs font-semibold opacity-60">{copy.standardTitle}</span>
                <input
                  value={proposal.titleByLang[editLanguage] || ""}
                  onChange={(event) => setProposal((current) => ({
                    ...current,
                    titleByLang: {
                      ...current.titleByLang,
                      [editLanguage]: event.target.value,
                    },
                  }))}
                  className="w-full rounded-xl border bg-transparent px-3 py-2"
                />
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold opacity-60">{copy.effectiveFrom}</span>
                  <input
                    type="date"
                    value={proposal.effectiveFrom || ""}
                    onChange={(event) => setProposal((current) => ({
                      ...current,
                      effectiveFrom: event.target.value || null,
                    }))}
                    className="w-full rounded-xl border bg-transparent px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold opacity-60">{copy.effectiveTo}</span>
                  <input
                    type="date"
                    value={proposal.effectiveTo || ""}
                    onChange={(event) => setProposal((current) => ({
                      ...current,
                      effectiveTo: event.target.value || null,
                    }))}
                    className="w-full rounded-xl border bg-transparent px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold opacity-60">{copy.passScore}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={proposal.minimumPassScore ?? 80}
                    onChange={(event) => setProposal((current) => ({
                      ...current,
                      minimumPassScore: Number(event.target.value),
                    }))}
                    className="w-full rounded-xl border bg-transparent px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addBlock}
                  className="rounded-xl border px-3 py-2 text-sm font-semibold"
                >
                  {copy.addBlock}
                </button>
                {sourceText.trim() && !proposal.blocks.length ? (
                  <button
                    type="button"
                    onClick={seedFromSource}
                    className="rounded-xl border px-3 py-2 text-sm font-semibold"
                  >
                    {copy.seed}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {proposal.blocks.map((block, index) => (
                  <div key={`${block.id}-${index}`} className="rounded-2xl border p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                      <input
                        value={block.id}
                        onChange={(event) => updateBlock(index, (current) => ({
                          ...current,
                          id: event.target.value,
                        }))}
                        placeholder={copy.blockId}
                        className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                      />
                      <select
                        value={block.severity}
                        onChange={(event) => updateBlock(index, (current) => ({
                          ...current,
                          severity: event.target.value as Severity,
                        }))}
                        className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                      >
                        <option value="normal">{copy.normal}</option>
                        <option value="important">{copy.important}</option>
                        <option value="critical">{copy.critical}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setProposal((current) => ({
                          ...current,
                          blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index),
                        }))}
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        {copy.remove}
                      </button>
                    </div>

                    <input
                      value={block.titleByLang[editLanguage] || ""}
                      onChange={(event) => updateBlock(index, (current) => ({
                        ...current,
                        titleByLang: {
                          ...current.titleByLang,
                          [editLanguage]: event.target.value,
                        },
                      }))}
                      placeholder={copy.blockTitle}
                      className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2 text-sm"
                    />
                    <textarea
                      value={block.bodyByLang[editLanguage] || ""}
                      onChange={(event) => updateBlock(index, (current) => ({
                        ...current,
                        bodyByLang: {
                          ...current.bodyByLang,
                          [editLanguage]: event.target.value,
                        },
                      }))}
                      placeholder={copy.blockBody}
                      className="mt-2 min-h-28 w-full rounded-xl border bg-transparent p-3 text-sm"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={
                  working
                  || !writesEnabled
                  || selected.status === "published"
                  || !proposal.blocks.length
                }
                onClick={() => void saveProposal()}
                className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {copy.saveProposal}
              </button>

              <p className="mt-3 text-xs opacity-55">{copy.approvalWarning}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
