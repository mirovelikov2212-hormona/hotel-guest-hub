"use client";

import { useId, useState, type FormEvent } from "react";
import MarketingIcon from "./MarketingIcon";
import "./ai-service-example.css";

export type AiExampleLanguage = "bg" | "en" | "de" | "ro" | "cz" | "ru";

const COPY = {
  bg: {
    title: "Хотелски услуги", housekeeping: "Хаускипинг", iron: "Заявка за ютия", massage: "Резервация за масаж",
    request: "Заяви ютия", book: "Резервирай масаж", room: "Стая 901",
    note: "Допълнителна информация (по желание)", review: "Прегледай заявката", back: "Промени заявката", close: "Затвори услугата",
    preview: "Примерна заявка — не се изпраща до хотел.",
    ready: "Заявката е готова за потвърждение. В активния хотелски хъб тя се изпраща към съответния отдел, а гостът проследява статуса ѝ.",
  },
  en: {
    title: "Hotel services", housekeeping: "Housekeeping", iron: "Request an iron", massage: "Massage booking",
    request: "Request an iron", book: "Book a massage", room: "Room 901",
    note: "Additional information (optional)", review: "Review request", back: "Edit request", close: "Close service",
    preview: "Sample request — it is not sent to a hotel.",
    ready: "The request is ready for confirmation. In the active hotel hub it is sent to the responsible team, and the guest can track its status.",
  },
  de: {
    title: "Hotelservices", housekeeping: "Housekeeping", iron: "Bügeleisen anfragen", massage: "Massagebuchung",
    request: "Bügeleisen anfragen", book: "Massage buchen", room: "Zimmer 901",
    note: "Zusätzliche Informationen (optional)", review: "Anfrage prüfen", back: "Anfrage ändern", close: "Service schließen",
    preview: "Beispielanfrage — sie wird nicht an ein Hotel gesendet.",
    ready: "Die Anfrage ist zur Bestätigung bereit. Im aktiven Hotel-Hub geht sie an das zuständige Team; der Gast kann ihren Status verfolgen.",
  },
  ro: {
    title: "Servicii hoteliere", housekeeping: "Menaj", iron: "Cerere pentru un fier de călcat", massage: "Rezervare masaj",
    request: "Solicită un fier de călcat", book: "Rezervă un masaj", room: "Camera 901",
    note: "Informații suplimentare (opțional)", review: "Verifică cererea", back: "Modifică cererea", close: "Închide serviciul",
    preview: "Cerere ilustrativă — nu este trimisă unui hotel.",
    ready: "Cererea este gata de confirmare. În portalul activ al hotelului este trimisă echipei responsabile, iar oaspetele îi poate urmări starea.",
  },
  cz: {
    title: "Hotelové služby", housekeeping: "Úklid", iron: "Žádost o žehličku", massage: "Rezervace masáže",
    request: "Požádat o žehličku", book: "Rezervovat masáž", room: "Pokoj 901",
    note: "Další informace (volitelné)", review: "Zkontrolovat žádost", back: "Upravit žádost", close: "Zavřít službu",
    preview: "Ukázková žádost — není odeslána do hotelu.",
    ready: "Žádost je připravena k potvrzení. V aktivním hotelovém portálu se odešle příslušnému týmu a host může sledovat její stav.",
  },
  ru: {
    title: "Услуги отеля", housekeeping: "Хозяйственная служба", iron: "Запрос на утюг", massage: "Бронирование массажа",
    request: "Запросить утюг", book: "Забронировать массаж", room: "Номер 901",
    note: "Дополнительная информация (необязательно)", review: "Проверить запрос", back: "Изменить запрос", close: "Закрыть услугу",
    preview: "Пример запроса — он не отправляется в отель.",
    ready: "Запрос готов к подтверждению. В действующем портале отеля он отправляется ответственному отделу, а гость может отслеживать его статус.",
  },
} as const;

export function HotelServiceCatalog({ lang, onSelect }: {
  lang: AiExampleLanguage;
  onSelect: (service: "iron" | "massage") => void;
}) {
  const c = COPY[lang];
  return <section className="gostaya-ai-service" lang={lang === "cz" ? "cs" : lang}>
    <h3>{c.title}</h3>
    <div className="gostaya-ai-service-catalog">
      <button type="button" onClick={() => onSelect("iron")}>
        <MarketingIcon name="housekeeping"/><strong>{c.housekeeping}</strong><span>{c.request} →</span>
      </button>
      <button type="button" onClick={() => onSelect("massage")}>
        <MarketingIcon name="massage"/><strong>{c.massage}</strong><span>{c.book} →</span>
      </button>
    </div>
  </section>;
}

/** Marketing illustration only; operational requests remain in the hotel hub. */
export function IronRequestExample({ lang, onClose }: {
  lang: AiExampleLanguage;
  onClose: () => void;
}) {
  const c = COPY[lang];
  const id = useId();
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState("");

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNote(String(new FormData(event.currentTarget).get("note") || "").trim());
    setReviewing(true);
  }

  return <section className="gostaya-ai-service" lang={lang === "cz" ? "cs" : lang} aria-labelledby={`${id}-title`}>
    <header><h3 id={`${id}-title`}>{c.iron}</h3><button type="button" aria-label={c.close} onClick={onClose}>×</button></header>
    <p className="gostaya-ai-service-room">{c.room} · {c.housekeeping}</p>
    {reviewing ? <div aria-live="polite">
      <p>{c.ready}</p>
      {note ? <blockquote>{note}</blockquote> : null}
      <button type="button" className="gostaya-ai-response-action" onClick={() => setReviewing(false)}>{c.back}</button>
    </div> : <form onSubmit={review}>
      <label htmlFor={`${id}-note`}>{c.note}</label>
      <textarea id={`${id}-note`} name="note" rows={2} maxLength={300} defaultValue={note}/>
      <button type="submit" className="gostaya-ai-response-action">{c.review} →</button>
    </form>}
    <p className="gostaya-ai-service-note">{c.preview}</p>
  </section>;
}
