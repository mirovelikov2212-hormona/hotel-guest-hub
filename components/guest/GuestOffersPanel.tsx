"use client";

import type { HotelOffer } from "@/lib/types";
import {
  buildGuestDesignAssetUrl,
  getHotelOfferLocalizedText,
  getHotelOfferReadyCreative,
} from "@/lib/guest/hotel-offers.mjs";

type GuestOffersPanelProps = {
  offers: HotelOffer[];
  hotelSlug: string;
  language: string;
  onRequestService: (requestType: string) => void;
  onInternalPage: (destination: string) => void;
  onTrackAction?: (offer: HotelOffer, action: string) => void;
};

const OFFER_UI_COPY: Record<string, {
  empty: string;
  validity: string;
  attachment: string;
  openReadyOffer: string;
}> = {
  bg: { empty: "В момента няма активни оферти.", validity: "Валидност", attachment: "Файл", openReadyOffer: "Виж офертата" },
  en: { empty: "There are no active offers at the moment.", validity: "Valid", attachment: "Attachment", openReadyOffer: "View offer" },
  de: { empty: "Zurzeit gibt es keine aktiven Angebote.", validity: "Gültigkeit", attachment: "Anhang", openReadyOffer: "Angebot ansehen" },
  ro: { empty: "Momentan nu există oferte active.", validity: "Valabilitate", attachment: "Fișier", openReadyOffer: "Vezi oferta" },
  cs: { empty: "Momentálně nejsou k dispozici žádné aktivní nabídky.", validity: "Platnost", attachment: "Soubor", openReadyOffer: "Zobrazit nabídku" },
  ru: { empty: "Сейчас нет активных предложений.", validity: "Срок действия", attachment: "Файл", openReadyOffer: "Посмотреть предложение" },
};

function copyFor(language: string) {
  const locale = String(language || "").trim().toLowerCase().split("-")[0];
  return OFFER_UI_COPY[locale] || OFFER_UI_COPY.en;
}

function localized(values: Record<string, string>, language: string) {
  return getHotelOfferLocalizedText(values, language);
}

function priceLabel(offer: HotelOffer, language: string) {
  if (offer.pricing.amountMinor === null || !offer.pricing.currency) return "";
  try {
    return new Intl.NumberFormat(language || "en", {
      style: "currency",
      currency: offer.pricing.currency,
    }).format(offer.pricing.amountMinor / 100);
  } catch {
    return (offer.pricing.amountMinor / 100).toFixed(2) + " " + offer.pricing.currency;
  }
}

function previousPriceLabel(offer: HotelOffer, language: string) {
  if (offer.pricing.previousAmountMinor === null || !offer.pricing.currency) return "";
  try {
    return new Intl.NumberFormat(language || "en", {
      style: "currency",
      currency: offer.pricing.currency,
    }).format(offer.pricing.previousAmountMinor / 100);
  } catch {
    return (offer.pricing.previousAmountMinor / 100).toFixed(2) + " " + offer.pricing.currency;
  }
}

function formatDate(value: string, language: string) {
  try {
    return new Intl.DateTimeFormat(language || "en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(value + "T00:00:00Z"));
  } catch {
    return value;
  }
}

function validityLabel(offer: HotelOffer, language: string) {
  const start = offer.validity.startDate;
  const end = offer.validity.endDate;
  if (!start && !end) return "";
  const prefix = copyFor(language).validity;
  if (start && end) return prefix + ": " + formatDate(start, language) + " – " + formatDate(end, language);
  return prefix + ": " + formatDate(start || end || "", language);
}

function externalHref(action: HotelOffer["cta"]["action"], destination: string) {
  if (action === "external_url") return destination;
  if (action === "phone") return destination.startsWith("tel:") ? destination : "tel:" + destination;
  if (action === "email") return destination.startsWith("mailto:") ? destination : "mailto:" + destination;
  return "";
}

export default function GuestOffersPanel({
  offers,
  hotelSlug,
  language,
  onRequestService,
  onInternalPage,
  onTrackAction,
}: GuestOffersPanelProps) {
  if (!offers.length) {
    return (
      <div className="rounded-2xl border border-[color:var(--stayhub-border)] bg-white/80 p-4 text-sm text-[color:var(--stayhub-muted)]">
        {copyFor(language).empty}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-stayhub-guest-offers="true">
      {offers.map((offer) => {
        const title = localized(offer.titleByLang, language);
        const shortDescription = localized(offer.shortDescriptionByLang, language);
        const description = localized(offer.descriptionByLang, language);
        const badge = localized(offer.badgeByLang, language);
        const ctaLabel = localized(offer.cta.labelByLang, language);
        const price = priceLabel(offer, language);
        const previousPrice = previousPriceLabel(offer, language);
        const validity = validityLabel(offer, language);
        const readyCreative = offer.presentationMode === "ready_asset"
          ? getHotelOfferReadyCreative(offer, language)
          : null;
        const readyCreativeUrl = readyCreative
          ? buildGuestDesignAssetUrl(hotelSlug, readyCreative.assetId)
          : "";
        const coverUrl = !readyCreative && offer.assets.coverAssetId
          ? buildGuestDesignAssetUrl(hotelSlug, offer.assets.coverAssetId)
          : "";

        return (
          <article
            key={offer.id}
            className="overflow-hidden rounded-2xl border border-[color:var(--stayhub-border)] bg-white/90 shadow-sm"
            data-stayhub-offer={offer.key}
          >
            {readyCreative?.kind === "image" && readyCreativeUrl ? (
              <div className="bg-[color:var(--stayhub-soft)] p-2">
                <img
                  src={readyCreativeUrl}
                  alt={title || ""}
                  className="max-h-[72vh] w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : coverUrl ? (
              <img
                src={coverUrl}
                alt={title || ""}
                className="h-44 w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : null}

            <div className="p-4">
              {badge ? (
                <div
                  className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--stayhub-action) 14%, white)",
                    color: "var(--stayhub-primary)",
                  }}
                >
                  {badge}
                </div>
              ) : null}

              <h3
                className="mt-2 text-lg font-semibold"
                style={{
                  color: "var(--stayhub-primary)",
                  fontFamily: "var(--stayhub-heading-font, inherit)",
                }}
              >
                {title}
              </h3>

              {shortDescription || description ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[color:var(--stayhub-muted)]">
                  {shortDescription || description}
                </p>
              ) : null}

              {readyCreative?.kind === "document" && readyCreativeUrl ? (
                <a
                  href={readyCreativeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-[color:var(--stayhub-border)] px-4 py-3 text-sm font-semibold text-[color:var(--stayhub-primary)]"
                  onClick={() => onTrackAction?.(offer, "ready_document")}
                >
                  {copyFor(language).openReadyOffer}
                </a>
              ) : null}

              {price || previousPrice ? (
                <div className="mt-3 flex items-baseline gap-2">
                  {price ? <span className="text-base font-semibold text-[color:var(--stayhub-primary)]">{price}</span> : null}
                  {previousPrice ? <span className="text-xs text-[color:var(--stayhub-muted)] line-through">{previousPrice}</span> : null}
                </div>
              ) : null}

              {validity ? <p className="mt-1 text-xs text-[color:var(--stayhub-muted)]">{validity}</p> : null}

              {offer.assets.galleryAssetIds.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {offer.assets.galleryAssetIds.map((assetId) => (
                    <img
                      key={assetId}
                      src={buildGuestDesignAssetUrl(hotelSlug, assetId)}
                      alt=""
                      className="aspect-square w-full rounded-xl object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              ) : null}

              {offer.assets.attachmentAssetIds.length ? (
                <div className="mt-3 space-y-2">
                  {offer.assets.attachmentAssetIds.map((assetId, index) => (
                    <a
                      key={assetId}
                      href={buildGuestDesignAssetUrl(hotelSlug, assetId, { download: true })}
                      className="flex min-h-11 items-center justify-between rounded-xl border border-[color:var(--stayhub-border)] px-3 py-2 text-sm font-medium text-[color:var(--stayhub-primary)]"
                      onClick={() => onTrackAction?.(offer, "attachment")}
                    >
                      <span>{copyFor(language).attachment} {index + 1}</span>
                      <span aria-hidden="true">↓</span>
                    </a>
                  ))}
                </div>
              ) : null}

              {offer.cta.action !== "none" && offer.cta.destination && ctaLabel ? (
                offer.cta.action === "request_service" || offer.cta.action === "internal_page" ? (
                  <button
                    type="button"
                    className="mt-4 min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold"
                    style={{ backgroundColor: "var(--stayhub-action)", color: "#ffffff" }}
                    onClick={() => {
                      onTrackAction?.(offer, offer.cta.action);
                      if (offer.cta.action === "request_service") onRequestService(offer.cta.destination || "");
                      else onInternalPage(offer.cta.destination || "");
                    }}
                  >
                    {ctaLabel}
                  </button>
                ) : (
                  <a
                    href={externalHref(offer.cta.action, offer.cta.destination)}
                    target={offer.cta.action === "external_url" ? "_blank" : undefined}
                    rel={offer.cta.action === "external_url" ? "noreferrer" : undefined}
                    className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold"
                    style={{ backgroundColor: "var(--stayhub-action)", color: "#ffffff" }}
                    onClick={() => onTrackAction?.(offer, offer.cta.action)}
                  >
                    {ctaLabel}
                  </a>
                )
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
