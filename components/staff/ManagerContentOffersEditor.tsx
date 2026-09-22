"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

import type { HubOfferV2 } from "@/lib/product-factory/hub-offer-contract";

type ManagerUiLanguage = "bg" | "en" | "de";
type GuestLanguage = "bg" | "en" | "de" | "ro" | "cs" | "ru";
type CreativeLanguage = "default" | GuestLanguage;
type CreativeSurface = "hub_ready" | "website_source";

type ContentAsset = {
  id: string;
  changeRequestId: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  kind: "image" | "document";
  lifecycleStatus: "draft" | "active" | "archived";
  creativeSurface: "hub_ready" | "website_source" | "generic_attachment";
  hubReviewStatus: "approved" | "pending_review" | "rejected" | "not_applicable";
  qualityStatus: "pass" | "warning" | "fail";
  imageWidth: number | null;
  imageHeight: number | null;
  quality: Record<string, unknown>;
  previewUrl: string | null;
};

type EditorPayload = {
  currentOffers: HubOfferV2[];
  draft: {
    id: string;
    stale: boolean;
    offers: HubOfferV2[];
    diff: Record<string, unknown>;
  } | null;
};

const GUEST_LANGUAGES: Array<{ id: GuestLanguage; label: string }> = [
  { id: "bg", label: "BG" },
  { id: "en", label: "EN" },
  { id: "de", label: "DE" },
  { id: "ro", label: "RO" },
  { id: "cs", label: "CZ" },
  { id: "ru", label: "RU" },
];

const CREATIVE_LANGUAGES: Array<{ id: CreativeLanguage; label: string }> = [
  { id: "default", label: "ALL" },
  ...GUEST_LANGUAGES,
];

const COPY = {
  bg: {
    eyebrow: "Промени в Hub",
    title: "Оферти",
    intro: "Редактирайте офертите като безопасна чернова. Черновата не променя Hub, докато не бъде публикувана.",
    open: "Управление на оферти",
    close: "Затвори",
    createStructured: "Създай в Hub",
    uploadReady: "Качи готова оферта",
    structuredHint: "Създайте офертата от текст, цена, период и бутон.",
    readyHint: "Качете готова рекламна визия или PDF от агенция.",
    hubVersion: "Версия за Hub",
    websiteVersion: "Версия за сайта",
    websiteWarning: "Файлът е направен за сайта. Прегледайте го в мобилната визуализация преди да го одобрите за Hub.",
    hubHint: "Изберете това, когато агенцията е подготвила отделна версия за мобилния Hub.",
    file: "Файл",
    language: "Езикова версия",
    target: "Към оферта",
    newOffer: "Нова оферта",
    upload: "Качи и провери",
    uploading: "Качване…",
    approve: "Одобри за Hub",
    reject: "Отхвърли",
    technicalPass: "Технически подходящ",
    technicalWarning: "Нужен е визуален преглед",
    technicalFail: "Файлът не е подходящ",
    mobilePreview: "Мобилен Hub preview",
    imageContain: "Визията се показва цяла, без автоматично изрязване.",
    pdfReview: "PDF трябва да се прегледа на телефон преди одобрение.",
    saveDraft: "Запази черновата",
    saving: "Запазване…",
    saved: "Черновата е запазена.",
    changed: "Има промени за преглед.",
    noChanged: "Няма промяна спрямо текущия Hub.",
    stale: "Hub е променен след отварянето на тази чернова. Заредете отново преди редакция.",
    reload: "Презареди",
    titleLabel: "Име",
    shortDescription: "Кратко описание",
    badge: "Badge / акцент",
    ctaLabel: "Текст на бутона",
    price: "Цена",
    oldPrice: "Стара цена",
    currency: "Валута",
    validFrom: "Валидна от",
    validUntil: "Валидна до",
    status: "Статус",
    cta: "Действие",
    destination: "Дестинация",
    archive: "Архивирай",
    structured: "Създадена в Hub",
    ready: "Готова визия",
    noOffers: "Няма оферти в тази чернова.",
    requiredTitle: "Добавете име поне на един език за всяка оферта.",
    selectFile: "Изберете JPG, PNG, WebP или PDF.",
    active: "Активна",
    scheduled: "Планирана",
    inactive: "Неактивна",
    archived: "Архивирана",
    draft: "Чернова",
    none: "Без бутон",
    external: "Външен линк",
    phone: "Телефон",
    email: "Имейл",
    internal: "Страница в Hub",
    requestService: "Заявка за услуга",
    readyAdded: "Готовата визия е добавена към черновата.",
    validationError: "Проверете въведените данни. Промяната не е записана.",
    conflictError: "Hub е променен междувременно. Презаредете данните преди нов опит.",
    accessError: "Нямате право да извършите тази промяна.",
    notFoundError: "Тази чернова или елемент вече не е наличен. Презаредете данните.",
    systemError: "Възникна системен проблем. Промяната не е публикувана и екипът на GOSTAYA е уведомен.",
  },
  en: {
    eyebrow: "Hub changes",
    title: "Offers",
    intro: "Edit offers as a safe draft. The draft does not change the Hub until it is published.",
    open: "Manage offers",
    close: "Close",
    createStructured: "Create in Hub",
    uploadReady: "Upload ready-made offer",
    structuredHint: "Build the offer from text, price, validity and CTA.",
    readyHint: "Upload a finished agency visual or PDF.",
    hubVersion: "Hub version",
    websiteVersion: "Website version",
    websiteWarning: "This file was made for the website. Review it in the mobile preview before approving it for the Hub.",
    hubHint: "Use this when the agency prepared a separate mobile Hub version.",
    file: "File",
    language: "Language version",
    target: "Attach to",
    newOffer: "New offer",
    upload: "Upload and check",
    uploading: "Uploading…",
    approve: "Approve for Hub",
    reject: "Reject",
    technicalPass: "Technically suitable",
    technicalWarning: "Visual review required",
    technicalFail: "File is not suitable",
    mobilePreview: "Mobile Hub preview",
    imageContain: "The full creative is shown without automatic cropping.",
    pdfReview: "Review the PDF on a phone before approval.",
    saveDraft: "Save draft",
    saving: "Saving…",
    saved: "Draft saved.",
    changed: "There are changes to review.",
    noChanged: "No change from the current Hub.",
    stale: "The Hub changed after this draft was opened. Reload before editing.",
    reload: "Reload",
    titleLabel: "Title",
    shortDescription: "Short description",
    badge: "Badge / highlight",
    ctaLabel: "Button label",
    price: "Price",
    oldPrice: "Previous price",
    currency: "Currency",
    validFrom: "Valid from",
    validUntil: "Valid until",
    status: "Status",
    cta: "Action",
    destination: "Destination",
    archive: "Archive",
    structured: "Created in Hub",
    ready: "Ready creative",
    noOffers: "There are no offers in this draft.",
    requiredTitle: "Add a title in at least one language for every offer.",
    selectFile: "Choose a JPG, PNG, WebP or PDF.",
    active: "Active",
    scheduled: "Scheduled",
    inactive: "Inactive",
    archived: "Archived",
    draft: "Draft",
    none: "No button",
    external: "External link",
    phone: "Phone",
    email: "Email",
    internal: "Hub page",
    requestService: "Service request",
    readyAdded: "The ready creative was added to the draft.",
    validationError: "Check the entered data. The change was not saved.",
    conflictError: "The Hub changed in the meantime. Reload before trying again.",
    accessError: "You do not have permission to make this change.",
    notFoundError: "This draft or item is no longer available. Reload the data.",
    systemError: "A system problem occurred. The change was not published and the GOSTAYA team has been notified.",
  },
  de: {
    eyebrow: "Hub-Änderungen",
    title: "Angebote",
    intro: "Bearbeiten Sie Angebote als sicheren Entwurf. Der Entwurf ändert den Hub erst nach der Veröffentlichung.",
    open: "Angebote verwalten",
    close: "Schließen",
    createStructured: "Im Hub erstellen",
    uploadReady: "Fertiges Angebot hochladen",
    structuredHint: "Erstellen Sie das Angebot aus Text, Preis, Gültigkeit und CTA.",
    readyHint: "Laden Sie eine fertige Agentur-Grafik oder PDF hoch.",
    hubVersion: "Hub-Version",
    websiteVersion: "Website-Version",
    websiteWarning: "Diese Datei wurde für die Website erstellt. Prüfen Sie sie in der mobilen Vorschau, bevor Sie sie für den Hub freigeben.",
    hubHint: "Wählen Sie dies, wenn die Agentur eine separate mobile Hub-Version erstellt hat.",
    file: "Datei",
    language: "Sprachversion",
    target: "Zu Angebot",
    newOffer: "Neues Angebot",
    upload: "Hochladen und prüfen",
    uploading: "Hochladen…",
    approve: "Für Hub freigeben",
    reject: "Ablehnen",
    technicalPass: "Technisch geeignet",
    technicalWarning: "Visuelle Prüfung erforderlich",
    technicalFail: "Datei ist nicht geeignet",
    mobilePreview: "Mobile Hub-Vorschau",
    imageContain: "Die Grafik wird vollständig ohne automatisches Zuschneiden angezeigt.",
    pdfReview: "PDF vor der Freigabe auf einem Smartphone prüfen.",
    saveDraft: "Entwurf speichern",
    saving: "Speichern…",
    saved: "Entwurf gespeichert.",
    changed: "Es gibt Änderungen zur Prüfung.",
    noChanged: "Keine Änderung gegenüber dem aktuellen Hub.",
    stale: "Der Hub wurde nach dem Öffnen dieses Entwurfs geändert. Bitte neu laden.",
    reload: "Neu laden",
    titleLabel: "Titel",
    shortDescription: "Kurzbeschreibung",
    badge: "Badge / Hinweis",
    ctaLabel: "Button-Text",
    price: "Preis",
    oldPrice: "Alter Preis",
    currency: "Währung",
    validFrom: "Gültig ab",
    validUntil: "Gültig bis",
    status: "Status",
    cta: "Aktion",
    destination: "Ziel",
    archive: "Archivieren",
    structured: "Im Hub erstellt",
    ready: "Fertige Grafik",
    noOffers: "Keine Angebote in diesem Entwurf.",
    requiredTitle: "Fügen Sie für jedes Angebot einen Titel in mindestens einer Sprache hinzu.",
    selectFile: "Wählen Sie JPG, PNG, WebP oder PDF.",
    active: "Aktiv",
    scheduled: "Geplant",
    inactive: "Inaktiv",
    archived: "Archiviert",
    draft: "Entwurf",
    none: "Kein Button",
    external: "Externer Link",
    phone: "Telefon",
    email: "E-Mail",
    internal: "Hub-Seite",
    requestService: "Serviceanfrage",
    readyAdded: "Die fertige Grafik wurde zum Entwurf hinzugefügt.",
    validationError: "Prüfen Sie die eingegebenen Daten. Die Änderung wurde nicht gespeichert.",
    conflictError: "Der Hub wurde inzwischen geändert. Laden Sie die Daten neu, bevor Sie es erneut versuchen.",
    accessError: "Sie haben keine Berechtigung für diese Änderung.",
    notFoundError: "Dieser Entwurf oder Eintrag ist nicht mehr verfügbar. Laden Sie die Daten neu.",
    systemError: "Ein Systemproblem ist aufgetreten. Die Änderung wurde nicht veröffentlicht und das GOSTAYA-Team wurde benachrichtigt.",
  },
} as const;

function cloneOffers(offers: HubOfferV2[]) {
  return structuredClone(offers || []);
}

function blankOffer(mode: "structured" | "ready_asset", sortOrder: number): HubOfferV2 {
  const id = crypto.randomUUID();
  return {
    schemaVersion: "hub-offer-v2",
    id,
    key: "offer-" + id.replace(/-/g, "").slice(0, 12),
    titleByLang: {},
    shortDescriptionByLang: {},
    descriptionByLang: {},
    badgeByLang: {},
    pricing: { amountMinor: null, previousAmountMinor: null, currency: "EUR" },
    validity: { startDate: null, endDate: null },
    cta: { labelByLang: {}, action: "none", destination: null },
    assets: {
      coverAssetId: null,
      galleryAssetIds: [],
      attachmentAssetIds: [],
      readyCreativeByLang: {},
    },
    presentationMode: mode,
    status: "active",
    sortOrder,
    source: { kind: "change_editor", sourceRef: null },
    designDraft: true,
  };
}

function fileBaseName(name: string) {
  return String(name || "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function numberToMinor(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function minorToInput(value: number | null) {
  return value === null ? "" : (value / 100).toFixed(2);
}

let storageClient: ReturnType<typeof createClient> | null = null;

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase browser storage configuration is missing.");
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

export default function ManagerContentOffersEditor({
  hotelSlug,
  lang,
}: {
  hotelSlug: string;
  lang: ManagerUiLanguage;
}) {
  const copy = COPY[lang] || COPY.bg;

  function managerFailureMessage(
    body: { error?: string; errorType?: string } | null,
    fallback: string,
  ) {
    if (body?.errorType === "validation") return copy.validationError;
    if (body?.errorType === "conflict") return copy.conflictError;
    if (body?.errorType === "access") return copy.accessError;
    if (body?.errorType === "not_found") return copy.notFoundError;
    if (body?.errorType === "system") return copy.systemError;
    return body?.error || fallback;
  }

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offers, setOffers] = useState<HubOfferV2[]>([]);
  const [changeRequestId, setChangeRequestId] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [guestLanguage, setGuestLanguage] = useState<GuestLanguage>("bg");
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [lastDiffChanged, setLastDiffChanged] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [uploadSurface, setUploadSurface] = useState<CreativeSurface>("hub_ready");
  const [uploadLanguage, setUploadLanguage] = useState<CreativeLanguage>("default");
  const [uploadTargetOfferId, setUploadTargetOfferId] = useState("new");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  async function loadAssets(draftId: string) {
    const response = await fetch(
      "/api/staff/content-changes/assets?hotelSlug="
        + encodeURIComponent(hotelSlug)
        + "&changeRequestId="
        + encodeURIComponent(draftId),
      { cache: "no-store", credentials: "same-origin" },
    );
    const body = await response.json().catch(() => null) as { ok?: boolean; assets?: ContentAsset[]; error?: string; errorType?: string } | null;
    if (!response.ok || !body?.ok) {
      throw new Error(managerFailureMessage(body, "CM5_CONTENT_ASSET_LIST_FAILED"));
    }
    setAssets(body.assets || []);
  }

  async function loadEditor() {
    if (!hotelSlug) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/staff/content-changes/offers?hotelSlug=" + encodeURIComponent(hotelSlug),
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json().catch(() => null) as { ok?: boolean; editor?: EditorPayload; error?: string; errorType?: string } | null;
      if (!response.ok || !body?.ok || !body.editor) {
        throw new Error(managerFailureMessage(body, "CM5_OFFER_EDITOR_LOAD_FAILED"));
      }

      const draft = body.editor.draft;
      const usableDraft = draft && !draft.stale ? draft : null;
      setStale(Boolean(draft?.stale));
      setChangeRequestId(usableDraft?.id || null);
      setOffers(cloneOffers(usableDraft?.offers || body.editor.currentOffers || []));
      setLastDiffChanged(
        usableDraft?.diff && typeof usableDraft.diff.changed === "boolean"
          ? Boolean(usableDraft.diff.changed)
          : null,
      );
      setAssets([]);
      if (usableDraft?.id) await loadAssets(usableDraft.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEditor();
  }, [hotelSlug]);

  async function ensureDraft() {
    if (changeRequestId) return changeRequestId;

    const response = await fetch("/api/staff/content-changes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_draft",
        hotelSlug,
        changeScope: ["offers"],
      }),
    });
    const body = await response.json().catch(() => null) as {
      ok?: boolean;
      change?: { id?: string };
      error?: string;
      errorType?: string;
    } | null;
    if (!response.ok || !body?.ok || !body.change?.id) {
      throw new Error(managerFailureMessage(body, "CM5_CHANGE_REQUEST_CREATE_FAILED"));
    }
    setChangeRequestId(body.change.id);
    return body.change.id;
  }

  function updateOffer(index: number, mutator: (offer: HubOfferV2) => HubOfferV2) {
    setOffers((current) => current.map((offer, offerIndex) => (
      offerIndex === index ? mutator(structuredClone(offer)) : offer
    )));
    setNotice("");
  }

  function updateLocalized(
    index: number,
    field: "titleByLang" | "shortDescriptionByLang" | "badgeByLang",
    language: GuestLanguage,
    value: string,
  ) {
    updateOffer(index, (offer) => ({
      ...offer,
      [field]: {
        ...offer[field],
        [language]: value,
      },
    }));
  }

  function addStructuredOffer() {
    setOffers((current) => [...current, blankOffer("structured", current.length + 1)]);
  }

  function attachReadyCreative(asset: ContentAsset) {
    const languageKey = uploadLanguage;
    setOffers((current) => {
      const targetIndex = uploadTargetOfferId === "new"
        ? -1
        : current.findIndex((offer) => offer.id === uploadTargetOfferId);

      const target = targetIndex >= 0
        ? structuredClone(current[targetIndex])
        : blankOffer("ready_asset", current.length + 1);

      target.presentationMode = "ready_asset";
      target.assets.readyCreativeByLang = {
        ...(target.assets.readyCreativeByLang || {}),
        [languageKey]: { assetId: asset.id, kind: asset.kind },
      };

      if (targetIndex < 0) {
        const managerGuestLanguage: GuestLanguage = lang === "de" ? "de" : lang === "en" ? "en" : "bg";
        target.titleByLang = {
          ...target.titleByLang,
          [managerGuestLanguage]: fileBaseName(asset.originalName),
        };
        return [...current, target];
      }

      return current.map((offer, index) => index === targetIndex ? target : offer);
    });

    setPendingAssetId(null);
    setUploadFile(null);
    setNotice(copy.readyAdded);
  }

  async function uploadReadyCreative() {
    if (!uploadFile) {
      setError(copy.selectFile);
      return;
    }

    setUploadBusy(true);
    setError("");
    setNotice("");
    try {
      const draftId = await ensureDraft();

      const prepareResponse = await fetch("/api/staff/content-changes/assets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          hotelSlug,
          changeRequestId: draftId,
          originalName: uploadFile.name,
          mimeType: uploadFile.type,
          fileSize: uploadFile.size,
          creativeSurface: uploadSurface,
        }),
      });
      const prepared = await prepareResponse.json().catch(() => null) as {
        ok?: boolean;
        upload?: { assetId: string; storagePath: string; token: string };
        error?: string;
        errorType?: string;
      } | null;
      if (!prepareResponse.ok || !prepared?.ok || !prepared.upload) {
        throw new Error(managerFailureMessage(prepared, "CM5_CONTENT_ASSET_PREPARE_FAILED"));
      }

      const storage = getStorageClient();
      const { error: uploadError } = await storage.storage
        .from("hub-design-assets")
        .uploadToSignedUrl(
          prepared.upload.storagePath,
          prepared.upload.token,
          uploadFile,
          { contentType: uploadFile.type, cacheControl: "3600" },
        );
      if (uploadError) throw new Error("CM5_CONTENT_ASSET_UPLOAD_FAILED:" + uploadError.message);

      const finalizeResponse = await fetch("/api/staff/content-changes/assets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          hotelSlug,
          changeRequestId: draftId,
          assetId: prepared.upload.assetId,
          storagePath: prepared.upload.storagePath,
          originalName: uploadFile.name,
          mimeType: uploadFile.type,
          fileSize: uploadFile.size,
          creativeSurface: uploadSurface,
        }),
      });
      const finalized = await finalizeResponse.json().catch(() => null) as {
        ok?: boolean;
        asset?: ContentAsset;
        error?: string;
        errorType?: string;
      } | null;
      if (!finalizeResponse.ok || !finalized?.ok || !finalized.asset) {
        throw new Error(managerFailureMessage(finalized, "CM5_CONTENT_ASSET_FINALIZE_FAILED"));
      }

      const asset = finalized.asset;
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      if (asset.hubReviewStatus === "approved") attachReadyCreative(asset);
      else setPendingAssetId(asset.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUploadBusy(false);
    }
  }

  async function reviewAsset(asset: ContentAsset, decision: "approve" | "reject") {
    setUploadBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/content-changes/assets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          hotelSlug,
          assetId: asset.id,
          decision,
        }),
      });
      const body = await response.json().catch(() => null) as {
        ok?: boolean;
        review?: {
          hubReviewStatus: string;
          qualityStatus: string;
          previewUrl: string | null;
        };
        error?: string;
        errorType?: string;
      } | null;
      if (!response.ok || !body?.ok || !body.review) {
        throw new Error(managerFailureMessage(body, "CM5_CONTENT_ASSET_REVIEW_FAILED"));
      }

      const updated: ContentAsset = {
        ...asset,
        hubReviewStatus: body.review.hubReviewStatus as ContentAsset["hubReviewStatus"],
        qualityStatus: body.review.qualityStatus as ContentAsset["qualityStatus"],
        previewUrl: body.review.previewUrl,
      };
      setAssets((current) => current.map((item) => item.id === asset.id ? updated : item));

      if (decision === "approve") attachReadyCreative(updated);
      else {
        setPendingAssetId(null);
        setUploadFile(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUploadBusy(false);
    }
  }

  async function saveDraft() {
    if (!offers.every((offer) => Object.values(offer.titleByLang || {}).some((value) => String(value || "").trim()))) {
      setError(copy.requiredTitle);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const draftId = await ensureDraft();
      const response = await fetch("/api/staff/content-changes/offers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_draft",
          hotelSlug,
          changeRequestId: draftId,
          offers,
        }),
      });
      const body = await response.json().catch(() => null) as {
        ok?: boolean;
        result?: { offers?: HubOfferV2[]; diff?: Record<string, unknown> };
        error?: string;
        errorType?: string;
      } | null;
      if (!response.ok || !body?.ok || !body.result) {
        throw new Error(managerFailureMessage(body, "CM5_OFFER_DRAFT_SAVE_FAILED"));
      }

      if (body.result.offers) setOffers(cloneOffers(body.result.offers));
      const changed = Boolean(body.result.diff?.changed);
      setLastDiffChanged(changed);
      setNotice(copy.saved + " " + (changed ? copy.changed : copy.noChanged));
      await loadAssets(draftId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  const pendingAsset = pendingAssetId ? assetById.get(pendingAssetId) || null : null;
  const qualityText = pendingAsset?.qualityStatus === "pass"
    ? copy.technicalPass
    : pendingAsset?.qualityStatus === "warning"
      ? copy.technicalWarning
      : copy.technicalFail;

  return (
    <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-5" data-manager-content-offers="true">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/60">{copy.eyebrow}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{copy.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{copy.intro}</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50">
          {open ? copy.close : copy.open}
        </button>
      </div>

      {open ? (
        <div className="mt-5 space-y-5">
          {loading ? <p className="text-sm text-white/60">…</p> : null}

          {stale ? (
            <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-50">
              <p>{copy.stale}</p>
              <button type="button" onClick={() => void loadEditor()} className="mt-3 rounded-lg border border-amber-200/20 px-3 py-2 font-semibold">{copy.reload}</button>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" onClick={addStructuredOffer} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left hover:border-cyan-300/30">
              <p className="font-semibold text-white">{copy.createStructured}</p>
              <p className="mt-2 text-sm leading-5 text-white/55">{copy.structuredHint}</p>
            </button>

            <div className="rounded-2xl border border-violet-300/15 bg-violet-300/5 p-4">
              <p className="font-semibold text-white">{copy.uploadReady}</p>
              <p className="mt-2 text-sm leading-5 text-white/55">{copy.readyHint}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-white/65">
                  <span className="mb-1 block">{copy.file}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                    className="block w-full text-xs text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
                  />
                </label>

                <label className="text-xs text-white/65">
                  <span className="mb-1 block">{copy.language}</span>
                  <select value={uploadLanguage} onChange={(event) => setUploadLanguage(event.target.value as CreativeLanguage)} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white">
                    {CREATIVE_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
                  </select>
                </label>

                <label className="text-xs text-white/65">
                  <span className="mb-1 block">{copy.target}</span>
                  <select value={uploadTargetOfferId} onChange={(event) => setUploadTargetOfferId(event.target.value)} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white">
                    <option value="new">{copy.newOffer}</option>
                    {offers.filter((offer) => offer.presentationMode === "ready_asset").map((offer) => (
                      <option key={offer.id} value={offer.id}>{Object.values(offer.titleByLang || {}).find(Boolean) || offer.key}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setUploadSurface("hub_ready")} className={"rounded-lg border px-3 py-2 text-xs font-semibold " + (uploadSurface === "hub_ready" ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-50" : "border-white/10 bg-black/20 text-white/65")}>{copy.hubVersion}</button>
                  <button type="button" onClick={() => setUploadSurface("website_source")} className={"rounded-lg border px-3 py-2 text-xs font-semibold " + (uploadSurface === "website_source" ? "border-amber-300/35 bg-amber-300/15 text-amber-50" : "border-white/10 bg-black/20 text-white/65")}>{copy.websiteVersion}</button>
                </div>
              </div>

              <p className="mt-3 text-xs leading-5 text-white/50">{uploadSurface === "website_source" ? copy.websiteWarning : copy.hubHint}</p>
              <button type="button" onClick={() => void uploadReadyCreative()} disabled={uploadBusy || !uploadFile} className="mt-4 min-h-10 rounded-lg border border-violet-300/25 bg-violet-300/10 px-4 py-2 text-sm font-semibold text-violet-50 disabled:opacity-40">
                {uploadBusy ? copy.uploading : copy.upload}
              </button>
            </div>
          </div>

          {pendingAsset ? (
            <div className="rounded-2xl border border-amber-300/20 bg-black/25 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-amber-100/65">{copy.mobilePreview}</p>
                  <p className="mt-1 font-semibold text-white">{pendingAsset.originalName}</p>
                  <p className="mt-1 text-xs text-white/55">
                    {qualityText}
                    {pendingAsset.imageWidth && pendingAsset.imageHeight ? " · " + pendingAsset.imageWidth + "×" + pendingAsset.imageHeight : ""}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
                  {pendingAsset.creativeSurface === "website_source" ? copy.websiteVersion : copy.hubVersion}
                </span>
              </div>

              <div className="mx-auto mt-4 max-w-sm rounded-[2rem] border border-white/15 bg-white p-3 shadow-2xl">
                <div className="overflow-hidden rounded-[1.5rem] bg-neutral-100">
                  {pendingAsset.kind === "image" && pendingAsset.previewUrl ? (
                    <img src={pendingAsset.previewUrl} alt="" className="max-h-[65vh] w-full object-contain" />
                  ) : pendingAsset.previewUrl ? (
                    <a href={pendingAsset.previewUrl} target="_blank" rel="noreferrer" className="flex min-h-40 items-center justify-center px-5 text-center text-sm font-semibold text-neutral-800">
                      PDF · {pendingAsset.originalName}
                    </a>
                  ) : null}
                </div>
              </div>

              <p className="mt-3 text-center text-xs text-white/50">{pendingAsset.kind === "image" ? copy.imageContain : copy.pdfReview}</p>

              {pendingAsset.qualityStatus !== "fail" ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => void reviewAsset(pendingAsset, "approve")} disabled={uploadBusy} className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-50">{copy.approve}</button>
                  <button type="button" onClick={() => void reviewAsset(pendingAsset, "reject")} disabled={uploadBusy} className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-4 py-2 text-sm font-semibold text-rose-50">{copy.reject}</button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {GUEST_LANGUAGES.map((language) => (
              <button key={language.id} type="button" onClick={() => setGuestLanguage(language.id)} className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (guestLanguage === language.id ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-50" : "border-white/10 bg-black/20 text-white/60")}>{language.label}</button>
            ))}
          </div>

          <div className="space-y-4">
            {offers.length ? offers.map((offer, index) => {
              const readyEntries = Object.entries(offer.assets.readyCreativeByLang || {});
              return (
                <article key={offer.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/55">{offer.presentationMode === "ready_asset" ? copy.ready : copy.structured}</span>
                      <p className="mt-2 font-semibold text-white">{offer.titleByLang[guestLanguage] || Object.values(offer.titleByLang).find(Boolean) || offer.key}</p>
                    </div>
                    <button type="button" onClick={() => updateOffer(index, (current) => ({ ...current, status: "archived" }))} className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs font-semibold text-rose-100/80">{copy.archive}</button>
                  </div>

                  {offer.presentationMode === "ready_asset" && readyEntries.length ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {readyEntries.map(([language, creative]) => {
                        const asset = assetById.get(creative.assetId);
                        const previewUrl = asset?.previewUrl || (
                          "/api/guest/design-asset?hotelSlug="
                          + encodeURIComponent(hotelSlug)
                          + "&assetId="
                          + encodeURIComponent(creative.assetId)
                        );
                        return (
                          <div key={language} className="rounded-xl border border-white/10 bg-black/20 p-2">
                            <p className="mb-2 text-[10px] font-semibold uppercase text-white/45">{language === "default" ? "ALL" : language.toUpperCase()}</p>
                            {creative.kind === "image" ? (
                              <img src={previewUrl} alt="" className="max-h-56 w-full rounded-lg bg-white object-contain" />
                            ) : (
                              <a href={previewUrl} target="_blank" rel="noreferrer" className="flex min-h-24 items-center justify-center rounded-lg bg-white px-3 text-center text-xs font-semibold text-neutral-800">PDF</a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.titleLabel} · {guestLanguage.toUpperCase()}</span>
                      <input value={offer.titleByLang[guestLanguage] || ""} onChange={(event) => updateLocalized(index, "titleByLang", guestLanguage, event.target.value)} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.badge} · {guestLanguage.toUpperCase()}</span>
                      <input value={offer.badgeByLang[guestLanguage] || ""} onChange={(event) => updateLocalized(index, "badgeByLang", guestLanguage, event.target.value)} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />
                    </label>
                  </div>

                  <label className="mt-3 block text-xs text-white/60">
                    <span className="mb-1 block">{copy.shortDescription} · {guestLanguage.toUpperCase()}</span>
                    <textarea value={offer.shortDescriptionByLang[guestLanguage] || ""} onChange={(event) => updateLocalized(index, "shortDescriptionByLang", guestLanguage, event.target.value)} className="min-h-20 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
                  </label>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.price}</span>
                      <input type="number" min="0" step="0.01" value={minorToInput(offer.pricing.amountMinor)} onChange={(event) => updateOffer(index, (current) => ({ ...current, pricing: { ...current.pricing, amountMinor: numberToMinor(event.target.value) } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.oldPrice}</span>
                      <input type="number" min="0" step="0.01" value={minorToInput(offer.pricing.previousAmountMinor)} onChange={(event) => updateOffer(index, (current) => ({ ...current, pricing: { ...current.pricing, previousAmountMinor: numberToMinor(event.target.value) } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.currency}</span>
                      <input value={offer.pricing.currency || ""} maxLength={3} onChange={(event) => updateOffer(index, (current) => ({ ...current, pricing: { ...current.pricing, currency: event.target.value.toUpperCase() || null } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.validFrom}</span>
                      <input type="date" value={offer.validity.startDate || ""} onChange={(event) => updateOffer(index, (current) => ({ ...current, validity: { ...current.validity, startDate: event.target.value || null } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.validUntil}</span>
                      <input type="date" value={offer.validity.endDate || ""} onChange={(event) => updateOffer(index, (current) => ({ ...current, validity: { ...current.validity, endDate: event.target.value || null } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.status}</span>
                      <select value={offer.status} onChange={(event) => updateOffer(index, (current) => ({ ...current, status: event.target.value as HubOfferV2["status"] }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white">
                        <option value="active">{copy.active}</option>
                        <option value="scheduled">{copy.scheduled}</option>
                        <option value="inactive">{copy.inactive}</option>
                        <option value="archived">{copy.archived}</option>
                        <option value="draft">{copy.draft}</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.cta}</span>
                      <select value={offer.cta.action} onChange={(event) => updateOffer(index, (current) => ({ ...current, cta: { ...current.cta, action: event.target.value as HubOfferV2["cta"]["action"], destination: event.target.value === "none" ? null : current.cta.destination } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white">
                        <option value="none">{copy.none}</option>
                        <option value="external_url">{copy.external}</option>
                        <option value="phone">{copy.phone}</option>
                        <option value="email">{copy.email}</option>
                        <option value="internal_page">{copy.internal}</option>
                        <option value="request_service">{copy.requestService}</option>
                      </select>
                    </label>

                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.destination}</span>
                      {offer.cta.action === "internal_page" ? (
                        <select value={offer.cta.destination || ""} onChange={(event) => updateOffer(index, (current) => ({ ...current, cta: { ...current.cta, destination: event.target.value || null } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white">
                          <option value="">—</option>
                          <option value="home">Home</option>
                          <option value="page-services">Services</option>
                          <option value="page-offers">Offers</option>
                        </select>
                      ) : (
                        <input value={offer.cta.destination || ""} disabled={offer.cta.action === "none"} onChange={(event) => updateOffer(index, (current) => ({ ...current, cta: { ...current.cta, destination: event.target.value || null } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white disabled:opacity-40" />
                      )}
                    </label>

                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.ctaLabel} · {guestLanguage.toUpperCase()}</span>
                      <input value={offer.cta.labelByLang[guestLanguage] || ""} disabled={offer.cta.action === "none"} onChange={(event) => updateOffer(index, (current) => ({ ...current, cta: { ...current.cta, labelByLang: { ...current.cta.labelByLang, [guestLanguage]: event.target.value } } }))} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white disabled:opacity-40" />
                    </label>
                  </div>
                </article>
              );
            }) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/55">{copy.noOffers}</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void saveDraft()} disabled={saving || stale} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-50 disabled:opacity-40">
              {saving ? copy.saving : copy.saveDraft}
            </button>
            {lastDiffChanged !== null ? <span className="text-sm text-white/55">{lastDiffChanged ? copy.changed : copy.noChanged}</span> : null}
          </div>

          {notice ? <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">{notice}</div> : null}
          {error ? <div className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
