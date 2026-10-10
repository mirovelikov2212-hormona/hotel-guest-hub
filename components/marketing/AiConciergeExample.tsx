"use client";

import { useId, useState } from "react";
import MarketingIcon, { MarketingFlag } from "./MarketingIcon";
import MassageBookingExample from "./MassageBookingExample";
import { HotelServiceCatalog, IronRequestExample, type AiExampleLanguage } from "./AiServiceExample";

const CONVERSATIONS = {
  bg: { name: "Български", hello: "Как мога да помогна?", questions: ["Хотелски услуги", "Заявка за ютия", "Резервация за масаж"], answers: ["Мога да ви отворя директно услугите на хотела. Изберете услуга от бутона по-долу.", "Можете да заявите ютия директно оттук. Натиснете „Заяви ютия“, добавете уточнение при нужда и прегледайте заявката.", "Можете да започнете резервация директно оттук. Натиснете „Резервирай масаж“, изберете вид, дата и час и прегледайте избора преди окончателното потвърждение."] },
  en: { name: "English", hello: "How can I help?", questions: ["Hotel services", "Request an iron", "Book a massage"], answers: ["I can open the hotel services directly for you. Choose a service using the button below.", "You can request an iron right here. Select “Request an iron”, add any details and review your request.", "Start your booking right here. Select “Book a massage”, choose a treatment, date and time, then review before final confirmation."] },
  de: { name: "Deutsch", hello: "Wie kann ich helfen?", questions: ["Hotelservices", "Bügeleisen anfragen", "Massage buchen"], answers: ["Ich kann die Hotelservices direkt für Sie öffnen. Wählen Sie über die Schaltfläche unten einen Service.", "Hier können Sie direkt ein Bügeleisen anfragen. Wählen Sie „Bügeleisen anfragen“, ergänzen Sie Details und prüfen Sie Ihre Anfrage.", "Starten Sie die Buchung direkt hier. Wählen Sie „Massage buchen“, Behandlung, Datum und Uhrzeit und prüfen Sie alles vor der abschließenden Bestätigung."] },
  ro: { name: "Română", hello: "Cu ce vă pot ajuta?", questions: ["Servicii hoteliere", "Fier de călcat", "Rezervare masaj"], answers: ["Pot deschide direct serviciile hotelului. Alegeți un serviciu folosind butonul de mai jos.", "Puteți solicita un fier de călcat direct aici. Apăsați „Solicită un fier de călcat”, adăugați detalii și verificați cererea.", "Începeți rezervarea direct aici. Apăsați „Rezervă un masaj”, alegeți tipul, data și ora, apoi verificați înainte de confirmarea finală."] },
  cz: { name: "Čeština", hello: "Jak vám mohu pomoci?", questions: ["Hotelové služby", "Žádost o žehličku", "Rezervace masáže"], answers: ["Mohu vám přímo otevřít hotelové služby. Vyberte službu pomocí tlačítka níže.", "O žehličku můžete požádat přímo zde. Zvolte „Požádat o žehličku“, doplňte údaje a zkontrolujte žádost.", "Rezervaci začněte přímo zde. Zvolte „Rezervovat masáž“, vyberte typ, datum a čas a vše zkontrolujte před konečným potvrzením."] },
  ru: { name: "Русский", hello: "Чем я могу помочь?", questions: ["Услуги отеля", "Запросить утюг", "Записаться на массаж"], answers: ["Я могу открыть услуги отеля прямо здесь. Выберите услугу с помощью кнопки ниже.", "Вы можете запросить утюг прямо здесь. Нажмите «Запросить утюг», добавьте детали и проверьте запрос.", "Начните бронирование прямо здесь. Нажмите «Забронировать массаж», выберите вид, дату и время и проверьте выбор перед окончательным подтверждением."] },
} as const;

const ACTION_LABELS = {
  bg: ["Отвори услугите", "Заяви ютия", "Резервирай масаж"],
  en: ["Open services", "Request an iron", "Book a massage"],
  de: ["Services öffnen", "Bügeleisen anfragen", "Massage buchen"],
  ro: ["Deschide serviciile", "Solicită un fier de călcat", "Rezervă un masaj"],
  cz: ["Otevřít služby", "Požádat o žehličku", "Rezervovat masáž"],
  ru: ["Открыть услуги", "Запросить утюг", "Забронировать массаж"],
} as const;

export default function AiConciergeExample({ lang }: { lang: "bg" | "en" | "de" }) {
  const [language, setLanguage] = useState<AiExampleLanguage>(lang);
  const [question, setQuestion] = useState(0);
  const [actionOpen, setActionOpen] = useState(false);
  const actionId = useId();
  const c = CONVERSATIONS[language];
  const contentLanguage = language === "cz" ? "cs" : language;

  function selectService(service: "iron" | "massage") {
    setQuestion(service === "iron" ? 1 : 2);
    setActionOpen(true);
  }

  return <div className="gostaya-ai-example">
    <div className="gostaya-ai-example-header">
      <span className="gostaya-ai-signal" aria-hidden="true"><MarketingIcon name="sparkle"/></span>
      <div><strong>GOSTAYA AI</strong><p lang={contentLanguage}>{c.hello}</p></div>
    </div>
    <div className="gostaya-ai-language-picker" role="group" aria-label={lang === "bg" ? "Език на примера" : lang === "de" ? "Sprache des Beispiels" : "Example language"}>
      {(Object.keys(CONVERSATIONS) as AiExampleLanguage[]).map(locale => <button
        key={locale} type="button" aria-pressed={language === locale}
        aria-label={CONVERSATIONS[locale].name} title={CONVERSATIONS[locale].name}
        onClick={() => { setLanguage(locale); setActionOpen(false); }}>
        <MarketingFlag country={locale}/><span>{locale === "cz" ? "CS" : locale.toUpperCase()}</span>
      </button>)}
    </div>
    <div lang={contentLanguage}>
      <div className="gostaya-ai-question-picker" role="group" aria-label={c.hello}>
        {c.questions.map((label, index) => <button key={index} type="button" aria-pressed={question === index}
          onClick={() => { setQuestion(index); setActionOpen(false); }}>{label}</button>)}
      </div>
      <div className="gostaya-ai-transcript" aria-live="polite" aria-atomic="true">
        <p className="gostaya-ai-question">{c.questions[question]}</p>
        <p className="gostaya-ai-answer" key={`${language}-${question}`}>{c.answers[question]}</p>
        <button type="button" className="gostaya-ai-response-action" aria-expanded={actionOpen}
          aria-controls={actionId} onClick={() => setActionOpen(open => !open)}>
          {ACTION_LABELS[language][question]} <span aria-hidden="true">→</span>
        </button>
      </div>
      <div id={actionId} hidden={!actionOpen}>
        {actionOpen ? question === 2
          ? <MassageBookingExample key={language} lang={contentLanguage} onClose={() => setActionOpen(false)}/>
          : question === 1
            ? <IronRequestExample key={language} lang={language} onClose={() => setActionOpen(false)}/>
            : <HotelServiceCatalog lang={language} onSelect={selectService}/>
          : null}
      </div>
    </div>
    <p className="gostaya-ai-example-note">{lang === "bg"
      ? "Интерактивен пример: бутоните отварят директно услуга или резервация в сайта. Примерите не изпращат заявки до хотел."
      : lang === "de"
        ? "Interaktives Beispiel: Die Schaltflächen öffnen direkt einen Service oder eine Buchung auf der Website. Es werden keine Anfragen an ein Hotel gesendet."
        : "Interactive example: buttons open a service or booking directly on the website. No requests are sent to a hotel."}</p>
  </div>;
}
