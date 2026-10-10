"use client";

import { useRef, useState, type FormEvent } from "react";
import type { MarketingLanguage } from "@/lib/marketing-inquiry";
import "./conference-inquiry.css";

const COPY = {
  bg: {
    eyebrow: "НЕКА ПОГОВОРИМ ЗА ВАШИЯ ХОТЕЛ",
    title: "GOSTAYA за вашия хотел",
    description: "Оставете контакт и ще обсъдим как GOSTAYA може да се адаптира към вашия хотел. Можете да поискате и лично представяне на платформата.",
    note: "Демонстрационна версия на сайта. Представените примери показват концепцията и основните функции на GOSTAYA. Пълното представяне на платформата е по запитване.",
    name: "Вашето име", hotel: "Хотел / организация", email: "Имейл за контакт",
    message: "Как можем да ви помогнем?", optional: "по желание",
    placeholder: "Интересувам се от GOSTAYA за моя хотел…",
    privacy: "Използваме предоставените данни само за отговор на вашето запитване. Не ви записваме в маркетингов бюлетин.",
    consent: "Съгласен/на съм да се свържете с мен по това запитване.",
    submit: "Изпрати запитване", sending: "Изпращане…",
    success: "Благодарим! Запитването е изпратено. Ще се свържем с вас на посочения имейл.",
    failure: "Запитването не беше изпратено. Данните ви са запазени във формата — опитайте отново.",
    rate: "Вече изпратихте няколко запитвания. Моля, опитайте отново след 10 минути.",
  },
  en: {
    eyebrow: "LET’S TALK ABOUT YOUR HOTEL", title: "GOSTAYA for your hotel",
    description: "Leave your contact details to discuss how GOSTAYA can fit your hotel. You can also request a personal presentation of the platform.",
    note: "Demonstration website. The examples illustrate GOSTAYA’s concept and core features. A full platform presentation is available on request.",
    name: "Your name", hotel: "Hotel / organization", email: "Contact email",
    message: "How can we help?", optional: "optional", placeholder: "I’m interested in GOSTAYA for my hotel…",
    privacy: "We use your details only to respond to this inquiry. We do not subscribe you to a marketing newsletter.",
    consent: "I agree to be contacted about this inquiry.", submit: "Send inquiry", sending: "Sending…",
    success: "Thank you! Your inquiry has been sent. We will contact you at the email provided.",
    failure: "Your inquiry could not be sent. Your details remain in the form — please try again.",
    rate: "You have sent several inquiries. Please try again in 10 minutes.",
  },
  de: {
    eyebrow: "SPRECHEN WIR ÜBER IHR HOTEL", title: "GOSTAYA für Ihr Hotel",
    description: "Hinterlassen Sie Ihre Kontaktdaten, um zu besprechen, wie GOSTAYA zu Ihrem Hotel passt. Sie können auch eine persönliche Präsentation der Plattform anfragen.",
    note: "Demonstrationsversion der Website. Die Beispiele zeigen das Konzept und die Kernfunktionen von GOSTAYA. Eine vollständige Präsentation ist auf Anfrage möglich.",
    name: "Ihr Name", hotel: "Hotel / Organisation", email: "Kontakt-E-Mail",
    message: "Wie können wir helfen?", optional: "optional", placeholder: "Ich interessiere mich für GOSTAYA für mein Hotel…",
    privacy: "Wir verwenden Ihre Angaben nur zur Beantwortung dieser Anfrage. Sie werden nicht für einen Marketing-Newsletter angemeldet.",
    consent: "Ich bin damit einverstanden, zu dieser Anfrage kontaktiert zu werden.",
    submit: "Anfrage senden", sending: "Wird gesendet…",
    success: "Vielen Dank! Ihre Anfrage wurde gesendet. Wir kontaktieren Sie unter der angegebenen E-Mail-Adresse.",
    failure: "Ihre Anfrage konnte nicht gesendet werden. Ihre Angaben bleiben im Formular — bitte erneut versuchen.",
    rate: "Sie haben bereits mehrere Anfragen gesendet. Bitte versuchen Sie es in 10 Minuten erneut.",
  },
} as const;

function BrandText({ text }: { text: string }) {
  return <>{text.split(/(GOSTAYA)/g).map((part, index) => part === "GOSTAYA"
    ? <span key={index} className="gostaya-mobile-brand">{part}</span>
    : part)}</>;
}

export default function InquiryForm({ lang }: { lang: MarketingLanguage }) {
  const c = COPY[lang];
  const submitting = useRef(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/marketing/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"), hotel: data.get("hotel"), email: data.get("email"),
          message: data.get("message"), website: data.get("website"),
          consent: data.get("consent") === "on", language: lang,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        setError(response.status === 429 ? c.rate : c.failure);
        setStatus("error");
        return;
      }
      setStatus("sent");
      form.reset();
    } catch {
      setError(c.failure);
      setStatus("error");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <section id="inquiry" className="gostaya-shell gostaya-section gostaya-inquiry" aria-labelledby="inquiry-title">
      <div className="gostaya-inquiry-copy">
        <p className="gostaya-eyebrow">{c.eyebrow}</p>
        <h2 id="inquiry-title"><BrandText text={c.title}/></h2>
        <p className="gostaya-body"><BrandText text={c.description}/></p>
        <p className="gostaya-inquiry-preview-note"><BrandText text={c.note}/></p>
      </div>
      <form onSubmit={submit} className="gostaya-inquiry-form" aria-busy={status === "sending"}>
        <div className="gostaya-inquiry-fields">
          <label htmlFor="inquiry-name">{c.name}<input id="inquiry-name" name="name" autoComplete="name" required maxLength={100}/></label>
          <label htmlFor="inquiry-hotel">{c.hotel}<input id="inquiry-hotel" name="hotel" autoComplete="organization" required maxLength={160}/></label>
          <label htmlFor="inquiry-email" className="gostaya-inquiry-full">{c.email}<input id="inquiry-email" name="email" type="email" autoComplete="email" required maxLength={254}/></label>
          <label htmlFor="inquiry-message" className="gostaya-inquiry-full">{c.message} <span>({c.optional})</span><textarea id="inquiry-message" name="message" rows={3} maxLength={2000} placeholder={c.placeholder}/></label>
        </div>
        <div hidden aria-hidden="true"><label htmlFor="inquiry-website">Website<input id="inquiry-website" name="website" tabIndex={-1} autoComplete="off"/></label></div>
        <p id="inquiry-privacy" className="gostaya-inquiry-privacy">{c.privacy}</p>
        <label className="gostaya-inquiry-consent"><input type="checkbox" name="consent" required aria-describedby="inquiry-privacy"/>{c.consent}</label>
        <button type="submit" className="gostaya-primary-action" disabled={status === "sending" || status === "sent"}>{status === "sending" ? c.sending : c.submit}<span aria-hidden="true">↗</span></button>
        <div className="gostaya-inquiry-result" aria-live="polite" aria-atomic="true">
          {status === "sent" ? <p>{c.success}</p> : status === "error" ? <p role="alert">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}
