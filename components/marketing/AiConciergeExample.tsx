"use client";

import { useState } from "react";
import MarketingIcon, { MarketingFlag } from "./MarketingIcon";
import MassageBookingExample from "./MassageBookingExample";

const CONVERSATIONS = {
  bg: { name: "Български", hello: "Как мога да помогна?", questions: ["Работно време", "Заявка за ютия", "Резервация за масаж"], answers: ["В секция „Информация“ ще намерите работното време на хотелските обекти. Изберете обекта, който ви интересува.", "Отворете Хаускипинг в хъба и изпратете заявка за ютия. Можете да проследите статуса ѝ в хъба.", "Отворете „Резервирай масаж“, изберете вид, дата и свободен час. Резервацията се записва след окончателното потвърждение."] },
  en: { name: "English", hello: "How can I help?", questions: ["Opening hours", "Request an iron", "Book a massage"], answers: ["Hotel venue opening hours are in the Information section. Choose the venue you are interested in.", "Open Housekeeping in the hub and send a request for an iron. You can follow its status in the hub.", "Open Book a massage and choose a treatment, date and available time. The booking is saved after your final confirmation."] },
  de: { name: "Deutsch", hello: "Wie kann ich helfen?", questions: ["Öffnungszeiten", "Bügeleisen anfragen", "Massage buchen"], answers: ["Die Öffnungszeiten der Hoteleinrichtungen finden Sie unter Informationen. Wählen Sie die gewünschte Einrichtung.", "Öffnen Sie Housekeeping im Hub und fragen Sie ein Bügeleisen an. Den Status sehen Sie im Hub.", "Öffnen Sie Massage buchen und wählen Sie Behandlung, Datum und verfügbare Uhrzeit. Die Buchung wird nach der abschließenden Bestätigung gespeichert."] },
  ro: { name: "Română", hello: "Cu ce vă pot ajuta?", questions: ["Program", "Fier de călcat", "Rezervare masaj"], answers: ["Programul facilităților hotelului este în secțiunea Informații. Selectați facilitatea dorită.", "Deschideți secțiunea Menaj în portal și trimiteți o cerere pentru un fier de călcat. Puteți urmări starea în portal.", "Deschideți Rezervă un masaj și alegeți tipul, data și ora disponibilă. Rezervarea este salvată după confirmarea finală."] },
  cz: { name: "Čeština", hello: "Jak vám mohu pomoci?", questions: ["Otevírací doba", "Žádost o žehličku", "Rezervace masáže"], answers: ["Otevírací dobu hotelových zařízení najdete v sekci Informace. Vyberte požadované zařízení.", "Otevřete úklidový tým v portálu a odešlete žádost o žehličku. Stav můžete sledovat v portálu.", "Otevřete Rezervovat masáž a vyberte typ, datum a volný čas. Rezervace se uloží po konečném potvrzení."] },
  ru: { name: "Русский", hello: "Чем я могу помочь?", questions: ["Часы работы", "Запросить утюг", "Записаться на массаж"], answers: ["Часы работы объектов отеля находятся в разделе «Информация». Выберите интересующий вас объект.", "Откройте хозяйственную службу в портале и отправьте запрос на утюг. Статус можно отслеживать в портале.", "Откройте «Забронировать массаж», выберите вид, дату и свободное время. Запись сохраняется после окончательного подтверждения."] },
} as const;

const ACTION_LABELS = {
  bg: ["Отвори информацията", "Отвори Хаускипинг", "Резервирай масаж"],
  en: ["Open information", "Open Housekeeping", "Book a massage"],
  de: ["Informationen öffnen", "Housekeeping öffnen", "Massage buchen"],
  ro: ["Deschide informațiile", "Deschide Menaj", "Rezervă un masaj"],
  cz: ["Otevřít informace", "Otevřít úklid", "Rezervovat masáž"],
  ru: ["Открыть информацию", "Открыть хозяйственную службу", "Забронировать массаж"],
} as const;
const ACTION_SECTIONS = ["info", "housekeeping", "massage_booking"] as const;

export default function AiConciergeExample({ lang }: { lang: "bg" | "en" | "de" }) {
  const [language, setLanguage] = useState<keyof typeof CONVERSATIONS>(lang);
  const [question, setQuestion] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);
  const c = CONVERSATIONS[language];
  return <div className="gostaya-ai-example">
    <div className="gostaya-ai-example-header"><span className="gostaya-ai-signal" aria-hidden="true"><MarketingIcon name="sparkle"/></span><div><strong>GOSTAYA AI</strong><p lang={language === "cz" ? "cs" : language}>{c.hello}</p></div></div>
    <div className="gostaya-ai-language-picker" role="group" aria-label={lang === "bg" ? "Език на примера" : lang === "de" ? "Sprache des Beispiels" : "Example language"}>{(Object.keys(CONVERSATIONS) as (keyof typeof CONVERSATIONS)[]).map(locale => <button key={locale} type="button" aria-pressed={language === locale} aria-label={CONVERSATIONS[locale].name} title={CONVERSATIONS[locale].name} onClick={() => {setLanguage(locale);setBookingOpen(false);}}><MarketingFlag country={locale}/><span>{locale === "cz" ? "CS" : locale.toUpperCase()}</span></button>)}</div>
    <div lang={language === "cz" ? "cs" : language}><div className="gostaya-ai-question-picker" role="group" aria-label={c.hello}>{c.questions.map((label,i)=><button key={i} type="button" aria-pressed={question === i} onClick={() => {setQuestion(i);setBookingOpen(false);}}>{label}</button>)}</div>
      <div className="gostaya-ai-transcript" aria-live="polite" aria-atomic="true"><p className="gostaya-ai-question">{c.questions[question]}</p><p className="gostaya-ai-answer" key={`${language}-${question}`}>{c.answers[question]}</p>{question === 2 ? <button type="button" className="gostaya-ai-response-action" aria-expanded={bookingOpen} onClick={()=>setBookingOpen(!bookingOpen)}>{ACTION_LABELS[language][question]} <span aria-hidden="true">→</span></button> : <a className="gostaya-ai-response-action" href={`/demo?lang=${lang}&guestLang=${language === "cz" ? "cs" : language}&section=${ACTION_SECTIONS[question]}`}>{ACTION_LABELS[language][question]} <span aria-hidden="true">→</span></a>}</div></div>
    {bookingOpen ? <MassageBookingExample lang={lang} onClose={()=>setBookingOpen(false)}/> : null}
    <p className="gostaya-ai-example-note">{lang === "bg" ? "Примерни отговори и езици. Информацията и Хаускипинг се отварят в демото за стая 901. Масажът показва примерна резервация. Езиците се настройват според гостите на хотела." : lang === "de" ? "Beispielantworten und Sprachen. Informationen und Housekeeping öffnen sich im Demo für Zimmer 901. Massage zeigt ein Buchungsbeispiel. Die Sprachen richten sich nach Ihren Gästen." : "Example answers and languages. Information and Housekeeping open in the room 901 demo. Massage opens a booking example. Languages are configured for your guests."}</p>
  </div>;
}
