import Image from "next/image";
import { HeroJourney } from "./ProductExperience";
import "./marketing-design.css";
import ProductWalkthrough from "./ProductWalkthrough";
import BeforeAfterFlow from "./BeforeAfterFlow";
import BrandHubShowcase from "./BrandHubShowcase";
import WhyGostaya from "./WhyGostaya";
import PilotCaseStudy from "./PilotCaseStudy";
import AiAssistantBanner from "./AiAssistantBanner";
import InquiryForm from "./InquiryForm";
type Lang="bg"|"en"|"de";
const COPY={bg:{nav:["Продукт","Как работи","Резултати","Платформа","Въпроси"],eyebrow:"ДИГИТАЛЕН КОНСИЕРЖ И ОПЕРАТИВНА ПЛАТФОРМА ЗА ХОТЕЛИ",title:"GOSTAYA – Дигиталното сърце на всеки хотел",text:"Интелигентна автоматизация на хотелските процеси – от всеки клик на госта до отчета за мениджмънта.",purposeText:"GOSTAYA оптимизира връзката между гостите, хотелските екипи и мениджмънта чрез автоматизация, директно насочване и проследими процеси. GOSTAYA не заменя хотелския екип — увеличава неговия оперативен капацитет, ефективност и способност да поддържа последователно обслужване.",primary:"Виж продукта",secondary:"Демо на живо · PIN 2026",perspectives:"Една платформа.\nЧетири основни роли.",perspectiveText:"GOSTAYA свързва гостите, хотелските екипи и мениджмънта в една система за обслужване, координация и проследяване.",cards:[["За госта","Брандиран QR/PWA портал (Guest Hub), бърза информация, услуги, AI асистент и дигитални заявки."],["За екипа","Рецепция, Хаускипинг и Поддръжка получават точните задачи с ясни статуси в реално време."],["За мениджъра","Оперативно управление, качество, разрешаване на проблеми, приходи, възвръщаемост (ROI) и развитие на персонала – всичко на едно място."],["За хотела","Хотелски правила, стандарти, лесно внедряване и интеграции, които пазят идентичността на бранда ви."]],brandEyebrow:"ИДЕНТИЧНОСТТА НА ХОТЕЛА",brandTitle:"GOSTAYA: Вашият бранд в ръцете на госта.",brandText:"Всеки визуален детайл – от цветовете до шрифтовете – се адаптира изцяло,\nза да може гостът да усеща идентичността на вашия хотел във всеки момент.",evidenceEyebrow:"РЕАЛНИ ДАННИ ОТ ПИЛОТЕН ХОТЕЛ",evidenceTitle:"Реален сезон. Реални данни.",evidenceText:"Анонимизирани данни от сезонен пилотен хотел на българското Черноморие.\nРеално измерените събития са отделени от изчислените оперативни оценки.",evidenceNote:"През пилотния период GOSTAYA все още не е била свързана с PMS.\nПоказаните взаимодействия отразяват само реалното използване на портала от гости, които са получили достъп чрез QR кода.",metrics:[["5 347","отваряния на портала"],["2 448","взаимодействия с информация"],["145","заявки за услуги"],["56","резервации за масаж"],["€2 570","начислена стойност от масажи"],["24–45 ч.","оценено спестено административно време"]],aiTitle:"AI агент\nобучен по вашите стандарти",aiText:"Платформата изолира AI средата, като я захранва само с валидните за вас правила и стандарти. Гостите получават мигновени отговори единствено за услугите в хотела, с ограничен достъп до вътрешна информация и контролирани действия.",faqTitle:"Често задавани въпроси",faqs:[["Какво е GOSTAYA?","Дигитална платформа за автоматизация на хотелските процеси, която свързва портала за госта, хотелските отдели и мениджърския панел."],["Трябва ли гостът да инсталира приложение?","Порталът за госта работи директно в браузъра и по желание може да бъде добавен като PWA пряк път."],["Може ли заявка да стигне директно до отдел?","Да. Заявките се насочват автоматично според правилата и работното време на конкретния хотел."],["Как се измерва възвръщаемостта?","Реално измерените събития се отделят от изчислените показатели и моделираните оценки, например потенциално спестено административно време."],["Как мога да разгледам цялата платформа?","Този сайт е демонстрационна версия с илюстративни примери. Изпратете кратко запитване чрез бутона горе вдясно, за да уговорим лично представяне за вашия хотел."]],finalTitle:"Не гледайте поредното продуктово видео. Пуснете една заявка през хотела.",finalText:"Сканирайте QR кода, използвайте портала за госта и след това отворете мениджърския панел.",finalCta:"Към демото"},en:{nav:["Product","How it works","Evidence","Platform","FAQ"],eyebrow:"AI GUEST EXPERIENCE + HOTEL OPERATIONS",title:"One platform between the guest, the hotel team and management.",text:"GOSTAYA connects guest service, AI assistance, hotel teams and management in one system that automatically sends each request to the right department and tracks it through completion.",primary:"Explore the product",secondary:"Live demo · PIN 2026",perspectives:"One platform. Every perspective.",perspectiveText:"One request moves through the hotel and creates clear operational evidence.",cards:[["For guests","Branded QR/PWA Guest Hub, information, services, AI concierge and requests."],["For teams","Reception, Housekeeping and Maintenance receive the right work with clear status."],["For managers","Operations, quality, incidents, revenue, ROI/value and staff development in one place."],["For the hotel","Design Studio, hotel rules, standards, onboarding and integrations preserve property identity."]],brandEyebrow:"DESIGN STUDIO",brandTitle:"GOSTAYA feels like part of the hotel — not a foreign app.",brandText:"One engine, different hotel identities. Colors, typography, imagery and content are configured per property.",brandTypes:["Resort","Luxury","Business","Boutique"],evidenceEyebrow:"REAL PILOT EVIDENCE",evidenceTitle:"A real season. Real interaction data.",evidenceText:"An anonymized seasonal pilot at a Bulgarian seaside hotel.\nObserved events are kept separate from modeled operational estimates.",evidenceNote:"During the pilot period GOSTAYA was not yet connected to a PMS.\nThe interactions shown reflect only real Guest Hub usage after QR access.",metrics:[["5,347","Guest Hub opens"],["2,448","info interactions"],["145","service requests"],["56","massage bookings"],["€2,570","charged massage value"],["24–45 h","estimated admin time avoided"]],aiTitle:"AI that knows its boundaries.",aiText:"AI assists understanding, summarization and safe actions while the hotel remains the authority. No invented availability, fabricated action success or automated HR verdicts.",faqTitle:"Frequently asked questions",faqs:[["What is GOSTAYA?","A multi-hotel guest-experience and hotel-operations platform connecting the Guest Hub, departments and management intelligence."],["Does the guest need an app?","No. The Guest Hub runs in the browser and can optionally be added as a PWA shortcut."],["Can a request go directly to a department?","Yes. Routing follows the rules and working hours of the specific hotel."],["How is ROI measured?","Observed events are separated from derived metrics and modeled values such as estimated saved time."],["How can I explore the full platform?","This is a demonstration website with illustrative examples. Use the button at the top right to request a personal presentation for your hotel."]],finalTitle:"Don't watch another product video. Run one request through the hotel.",finalText:"Scan the demo QR, use the Guest Hub, then open Manager.",finalCta:"Go to live demo"},de:{nav:["Produkt","So funktioniert es","Ergebnisse","Plattform","FAQ"],eyebrow:"AI GUEST EXPERIENCE + HOTEL OPERATIONS",title:"Eine Plattform zwischen Gast, Hotelteam und Management.",text:"GOSTAYA verbindet digitalen Gästeservice, direktes Department-Routing, AI Concierge, Staff Operations und Manager Intelligence in einem Operational Layer.",primary:"Produkt entdecken",secondary:"Live Demo · PIN 2026",perspectives:"Eine Plattform. Jede Perspektive.",perspectiveText:"Eine Anfrage läuft durch das Hotel und erzeugt klare operative Evidenz.",cards:[["Für Gäste","Gebrandeter QR/PWA Guest Hub, Hotelinformationen, Services, AI Concierge und Anfragen."],["Für Teams","Rezeption, Housekeeping und Technik erhalten die richtige Aufgabe mit klarem Status."],["Für Manager","Operations, Qualität, Probleme, Revenue, ROI/Value und Staff Development an einem Ort."],["Für das Hotel","Design Studio, Hotelregeln, Standards, Onboarding und Integrationen bewahren die Hotelidentität."]],brandEyebrow:"DESIGN STUDIO",brandTitle:"GOSTAYA fühlt sich wie ein Teil des Hotels an — nicht wie eine fremde App.",brandText:"Eine Engine, unterschiedliche Hotelidentitäten. Farben, Typografie, Bilder und Inhalte werden pro Hotel konfiguriert.",brandTypes:["Resort","Luxury","Business","Boutique"],evidenceEyebrow:"REAL PILOT EVIDENCE",evidenceTitle:"Eine echte Saison. Echte Interaktionsdaten.",evidenceText:"Anonymisierter Saison-Pilot in einem bulgarischen Küstenhotel.\nBeobachtete Events bleiben von modellierten Operational Estimates getrennt.",evidenceNote:"Im Pilotzeitraum war GOSTAYA noch nicht mit einem PMS verbunden.\nDie gezeigten Interaktionen stammen nur aus realer Guest-Hub-Nutzung nach QR-Zugriff.",metrics:[["5.347","Guest Hub opens"],["2.448","info interactions"],["145","service requests"],["56","massage bookings"],["€2.570","charged massage value"],["24–45 h","estimated admin time avoided"]],aiTitle:"AI, die ihre Grenzen kennt.",aiText:"AI unterstützt Verständnis, Zusammenfassung und sichere Aktionen; das Hotel bleibt die Autorität. Keine erfundene Verfügbarkeit, keine falschen Bestätigungen und keine automatischen HR-Urteile.",faqTitle:"Häufige Fragen",faqs:[["Was ist GOSTAYA?","Eine Multi-Hotel Guest-Experience- und Hotel-Operations-Plattform, die Guest Hub, Abteilungen und Management Intelligence verbindet."],["Muss der Gast eine App installieren?","Nein. Der Guest Hub läuft im Browser und kann optional als PWA Shortcut hinzugefügt werden."],["Kann eine Anfrage direkt an eine Abteilung gehen?","Ja. Das Routing folgt Regeln und Arbeitszeiten des jeweiligen Hotels."],["Wie wird ROI gemessen?","Beobachtete Events werden von abgeleiteten Metriken und modellierten Werten wie geschätzter Zeitersparnis getrennt."],["Wie kann ich die gesamte Plattform kennenlernen?","Dies ist eine Demonstrationswebsite mit anschaulichen Beispielen. Über die Schaltfläche oben rechts können Sie eine persönliche Präsentation für Ihr Hotel anfragen."]],finalTitle:"Nicht noch ein Produktvideo ansehen. Lassen Sie eine Anfrage durch das Hotel laufen.",finalText:"Demo-QR scannen, Guest Hub nutzen und danach Manager öffnen.",finalCta:"Zum Live Demo"}} as const;
function BrandText({text,hero=false}:{text:string;hero?:boolean}){return <>{text.split(/(GOSTAYA)/g).map((part,index)=>part==="GOSTAYA"?<span key={index} className={hero?"gostaya-mobile-brand gostaya-hero-brand":"gostaya-mobile-brand"}>{part}</span>:part)}</>}
export default function MarketingPage({lang}:{lang:Lang}) {
  const c=COPY[lang];
  return <main lang={lang} className="gostaya-marketing">
    <header className="gostaya-header">
      <div className="gostaya-header-inner">
        <a href={`/${lang}`} className="gostaya-wordmark">GOSTAYA</a>
        <nav className="gostaya-nav">
          {[c.nav[0],c.nav[1],c.nav[3],c.nav[2],c.nav[4]].map((n,i)=><a key={n} href={["#why","#how","#platform","#evidence","#faq"][i]} className="hover:text-[#791fc8]">{n}</a>)}
        </nav>
        <div className="gostaya-header-actions"><div className="gostaya-languages" aria-label="Language">{(["bg","en","de"] as const).map((locale)=><a key={locale} href={`/${locale}`} hrefLang={locale} aria-current={lang===locale?"page":undefined}>{locale.toUpperCase()}</a>)}</div><a href="#inquiry" className="gostaya-primary-action rounded-xl bg-[#791fc8] px-4 py-2 text-xs font-black text-white shadow-md shadow-violet-100" aria-label={lang === "bg" ? "Заяви представяне на GOSTAYA" : lang === "de" ? "GOSTAYA-Präsentation anfragen" : "Request a GOSTAYA presentation"}>{lang === "bg" ? "ДЕМО" : "DEMO"}</a></div>
      </div>
    </header>

    <p className="gostaya-preview-notice">{lang === "bg" ? "Демонстрационна версия на сайта · Пълно представяне по запитване" : lang === "de" ? "Demonstrationsversion · Vollständige Präsentation auf Anfrage" : "Demonstration website · Full presentation on request"}</p>

    <section className="gostaya-hero gostaya-shell">
      <div className="gostaya-hero-grid">
        <div className="gostaya-hero-copy">
          <p className="text-[11px] font-black tracking-[.22em] text-[#791fc8]">{c.eyebrow}</p>
          <h1 className="mt-3 max-w-4xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-[#2b1340] sm:text-5xl">
            <BrandText text={c.title} hero/>
          </h1>
          <p className="mt-4 max-w-3xl text-pretty text-base leading-7 text-slate-600 sm:text-lg"><BrandText text={c.text}/></p>
          {lang==="bg"&&"purposeText" in c?<div className="mt-4 max-w-4xl text-base leading-7 text-slate-600 sm:text-lg">
            <p className="gostaya-mobile-justify"><BrandText text="GOSTAYA оптимизира връзката между гостите, хотелските екипи и мениджмънта чрез автоматизация, директно насочване и проследими процеси."/></p>
            <p className="gostaya-mobile-justify mt-1"><BrandText text="GOSTAYA не заменя хотелския екип — увеличава неговия оперативен капацитет, ефективност и способност да поддържа последователно обслужване."/></p>
          </div>:null}

        </div>

        <div className="gostaya-hero-image">
          <Image
            src="/marketing/reference/gostaya-sunset-reference.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="object-cover object-center"
          />
          <div className="gostaya-hero-fade" />
          <HeroJourney lang={lang}/>
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white/10 to-transparent" />
        </div>
      </div>
    </section>

    <WhyGostaya lang={lang}/>
    <div id="how" className="scroll-mt-28"><BeforeAfterFlow lang={lang}/></div>
    <div id="platform" className="scroll-mt-28"><ProductWalkthrough lang={lang}/></div>

    <section id="brand" className="gostaya-shell gostaya-section gostaya-brand-section">
      <BrandHubShowcase lang={lang} eyebrow={c.brandEyebrow} title={c.brandTitle} text={c.brandText}/>
    </section>

    <PilotCaseStudy lang={lang}/>
    <AiAssistantBanner lang={lang}/>

    <InquiryForm lang={lang}/>

    <section id="faq" className="gostaya-shell gostaya-section gostaya-faq">
      <h2 className="text-3xl font-semibold sm:text-5xl">{c.faqTitle}</h2>
      <div className="mt-6 space-y-3">
        {c.faqs.map(([q,a])=><details key={q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-semibold"><span><BrandText text={q}/></span></summary>
          <p className="mt-3 text-sm leading-6 text-slate-600"><BrandText text={a}/></p>
        </details>)}
      </div>
    </section>

    <footer className="gostaya-shell gostaya-footer">
      <BrandText text={lang==="bg"?"© 2026 GOSTAYA · дигитално обслужване на гости · хотелски операции · мениджърски анализ":"© 2026 GOSTAYA · AI guest experience · hotel operations · manager intelligence"}/>
    </footer>
  </main>
}
