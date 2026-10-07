"use client";

import { useId, useState } from "react";
import DemoLaunchLink from "./DemoLaunchLink";

const COPY = {
  bg: {title:"Примерна резервация",note:"Илюстративен преглед с примерни услуги и часове. Не изпраща резервация и не показва реална наличност.",type:"Вид масаж",types:["Релаксиращ масаж", "Класически масаж"],date:"Дата",time:"Час (пример)",next:"Прегледай резервацията",back:"Промени избора",review:"Проверка преди потвърждение",final:"В хотел с активна услуга следва окончателно потвърждение. Едва тогава се записва резервацията и се отчита резултатът от ИИ насочването.",demo:"Към воденото демо",close:"Затвори примера"},
  en: {title:"Booking example",note:"Illustrative services and times. This preview does not submit a booking or show live availability.",type:"Massage type",types:["Relaxing massage", "Classic massage"],date:"Date",time:"Time (example)",next:"Review booking",back:"Change selection",review:"Review before confirmation",final:"At a hotel with this service enabled, final confirmation follows. Only then is the booking saved and the AI referral outcome recorded.",demo:"Open guided demo",close:"Close example"},
  de: {title:"Buchungsbeispiel",note:"Beispielhafte Anwendungen und Uhrzeiten. Keine Buchung und keine echte Verfügbarkeit.",type:"Massageart",types:["Entspannungsmassage", "Klassische Massage"],date:"Datum",time:"Uhrzeit (Beispiel)",next:"Buchung prüfen",back:"Auswahl ändern",review:"Prüfung vor der Bestätigung",final:"Bei einem Hotel mit aktivem Service folgt die abschließende Bestätigung. Erst dann werden Buchung und Ergebnis der KI-Empfehlung erfasst.",demo:"Geführte Demo öffnen",close:"Beispiel schließen"},
} as const;

export default function MassageBookingExample({lang,onClose}:{lang:"bg"|"en"|"de";onClose:()=>void}) {
  const c = COPY[lang];
  const id = useId();
  const [type,setType] = useState(0);
  const [date,setDate] = useState("");
  const [time,setTime] = useState("14:00");
  const [review,setReview] = useState(false);
  return <section className="gostaya-booking-example" aria-labelledby={`${id}-title`} lang={lang}>
    <div className="gostaya-booking-example-heading"><h3 id={`${id}-title`}>{review ? c.review : c.title}</h3><button type="button" aria-label={c.close} onClick={onClose}>×</button></div>
    <p>{c.note}</p>
    {!review ? <form onSubmit={event=>{
      event.preventDefault();
      const selection = new FormData(event.currentTarget);
      const selectedDate = String(selection.get("date") ?? "");
      if (!selectedDate || !event.currentTarget.reportValidity()) return;
      setType(Number(selection.get("type")));
      setDate(selectedDate);
      setTime(String(selection.get("time")));
      setReview(true);
    }}>
      <label htmlFor={`${id}-type`}>{c.type}</label><select id={`${id}-type`} name="type" value={type} onChange={event=>setType(Number(event.target.value))}>{c.types.map((label,i)=><option key={label} value={i}>{label}</option>)}</select>
      <div className="gostaya-booking-example-fields"><div><label htmlFor={`${id}-date`}>{c.date}</label><input id={`${id}-date`} name="date" type="date" required value={date} onChange={event=>setDate(event.target.value)}/></div><div><label htmlFor={`${id}-time`}>{c.time}</label><select id={`${id}-time`} name="time" value={time} onChange={event=>setTime(event.target.value)}><option>14:00</option><option>15:00</option><option>16:00</option></select></div></div>
      <button className="gostaya-ai-response-action" type="submit">{c.next} →</button>
    </form> : <div aria-live="polite"><p className="gostaya-booking-example-summary"><strong>{c.types[type]}</strong><br/>{date} · {time}</p><p>{c.final}</p><div className="gostaya-booking-example-actions"><button type="button" onClick={()=>setReview(false)}>{c.back}</button><DemoLaunchLink className="gostaya-ai-response-action">{c.demo} →</DemoLaunchLink></div></div>}
  </section>;
}
