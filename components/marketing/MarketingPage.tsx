"use client";

import React from "react";
import Section from "./Section";
import Faq from "./Faq";

type Lang = "bg" | "de" | "en";

type Copy = {
  navDemo: string;
  navCta: string;

  heroTitle: string;
  heroLines: string[];
  heroBadges: string[];

  challengeTitle: string;
  challenges: { title: string; text: string }[];

  solutionTitle: string;
  solutionBullets: string[];

  howTitle: string;
  howSubtitle: string;
  howSteps: { title: string; text: string }[];

  trustTitle: string;
  trustSubtitle: string;
  trustBullets: string[];

  featuresTitle: string;
  featuresSubtitle: string;
  features: { title: string; text: string }[];

  pricingTitle: string;
  pricingSubtitle: string;

  pricingCard: {
    price: string;
    setup: string;
    includesTitle: string;
    includes: string[];
    variableLabel: string;
    variableText: string;
    seasonalLines: string[];
    cta: string;
  };

  pricingSide: {
    title: string;
    items: string[];
  };

  pricingImpl: {
    title: string;
    text: string;
  };

  faqTitle: string;
  faqs: { q: string; a: string }[];

  footerTagline: string;
  footerNote: string;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function splitInHalf<T>(arr: T[]) {
  const mid = Math.ceil(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

function BulletList({
  items,
  theme,
  columns = 2,
}: {
  items: string[];
  theme: { muted: string; lavender: string };
  columns?: 1 | 2;
}) {
  const gridCols = columns === 2 ? "md:grid-cols-2" : "";
  return (
    <ul className={clsx("grid gap-3", gridCols)}>
      {items.map((b) => (
        <li key={b} className={clsx("text-sm leading-relaxed", theme.muted)}>
          <div className="flex items-start gap-3">
            <span className={clsx("mt-[2px] font-semibold", theme.lavender)}>✓</span>
            <span className="text-white">{b}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function MarketingPage({
  lang,
  hubUrlExample = "/qr/demo?src=roomcard&code=roomcard",
  contactEmail = "sales@yourdomain.com",
  brandName = "Digital Concierge",
}: {
  lang: Lang;
  hubUrlExample?: string;
  contactEmail?: string;
  brandName?: string;
}) {
  const c = getCopy(lang);

  const mailto = (subject: string) =>
    `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`;

  const theme = {
    topbar: "bg-[#0D1B2A]/70",
    panel: "bg-white/[0.05]",
    panelHover: "hover:bg-white/[0.07]",
    ring: "ring-1 ring-white/10",
    ringStrong: "ring-1 ring-white/14",
    text: "text-white",
    muted: "text-slate-300",
    muted2: "text-slate-400",
    accentBg: "bg-[#9B86BD]",
    accentText: "text-[#0D1B2A]",
    accentRing: "ring-1 ring-[#9B86BD]/35",
    accentSoft: "bg-[#9B86BD]/14",
    accentSoftRing: "ring-1 ring-[#9B86BD]/25",
    lavender: "text-[#9B86BD]",
  };

  const [solutionLeft, solutionRight] = splitInHalf(c.solutionBullets);

  return (
    <main
      className={clsx("min-h-screen relative overflow-hidden", theme.text)}
      style={{
        backgroundColor: "#0D1B2A",
        backgroundImage: `
          radial-gradient(900px 600px at 15% 10%, rgba(155,134,189,0.18), transparent 60%),
          radial-gradient(700px 520px at 85% 20%, rgba(155,134,189,0.12), transparent 55%),
          radial-gradient(900px 700px at 50% 100%, rgba(255,255,255,0.06), transparent 60%)
        `,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(80% 70% at 50% 45%, rgba(255,255,255,0.06), rgba(13,27,42,0) 55%),
            radial-gradient(120% 120% at 50% 50%, rgba(13,27,42,0) 40%, rgba(0,0,0,0.58) 100%)
          `,
        }}
      />

      <div
        className={clsx(
          "sticky top-0 z-30 backdrop-blur relative",
          theme.topbar,
          "border-b border-white/10"
        )}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "h-10 w-10 rounded-2xl flex items-center justify-center",
                theme.panel,
                theme.ring
              )}
            >
              <span className="font-bold tracking-tight text-white">HG</span>
            </div>
            <div className="leading-tight">
              <div className="font-semibold">{brandName}</div>
              <div className={clsx("text-xs", theme.muted2)}>QR • Guest Hub • No App</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={hubUrlExample}
              className={clsx(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                theme.panel,
                theme.ring,
                theme.panelHover,
                "transition"
              )}
            >
              {c.navDemo}
            </a>

            <a
              href={mailto(`${brandName} — Demo / Offer`)}
              className={clsx(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                theme.accentBg,
                theme.accentText,
                theme.accentRing,
                "hover:brightness-110 active:scale-[0.99] transition"
              )}
            >
              {c.navCta}
            </a>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-4 pt-12 pb-6 relative z-10">
        <div className="grid gap-6 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl tracking-tight">
              {c.heroTitle.split("\n").map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </h1>

            <div className={clsx("mt-3 space-y-1.5 leading-relaxed", theme.muted)}>
              {c.heroLines.map((line, idx) => (
                <p
                  key={idx}
                  className={clsx(
                    "text-sm md:text-[15px]",
                    idx === c.heroLines.length - 1 ? "font-medium text-white" : ""
                  )}
                >
                  {line}
                </p>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {c.heroBadges.map((b) => (
                <span
                  key={b}
                  className={clsx(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                    theme.panel,
                    theme.ring
                  )}
                >
                  <span className={clsx("mr-2", theme.lavender)}>●</span>
                  {b}
                </span>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              <a
                href={mailto(`${brandName} — Request demo`)}
                className={clsx(
                  "rounded-2xl px-4 py-3 text-sm font-semibold",
                  theme.accentBg,
                  theme.accentText,
                  theme.accentRing,
                  "hover:brightness-110 active:scale-[0.99] transition"
                )}
              >
                {c.navCta}
              </a>

              <a
                href={hubUrlExample}
                className={clsx(
                  "rounded-2xl px-4 py-3 text-sm font-semibold",
                  theme.panel,
                  theme.ring,
                  theme.panelHover,
                  "transition"
                )}
              >
                {c.navDemo}
              </a>
            </div>

            {c.footerNote ? (
              <div className={clsx("mt-4 text-xs", theme.muted2)}>{c.footerNote}</div>
            ) : null}
          </div>

          <div className="flex md:justify-end">
            <div
              className={clsx("rounded-3xl overflow-hidden", theme.panel, theme.ringStrong)}
              style={{ width: 320, maxWidth: "100%" }}
            >
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{brandName} — Demo</div>
                    <div className={clsx("mt-1 text-xs", theme.muted2)}>Guest Hub Preview</div>
                  </div>
                  <div
                    className={clsx(
                      "shrink-0 rounded-xl px-3 py-1 text-xs font-semibold",
                      theme.accentSoft,
                      theme.accentSoftRing
                    )}
                  >
                    Room confirmed
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  {[
                    "📶 Wi-Fi",
                    "ℹ️ Info",
                    "🧺 Housekeeping",
                    "🛎 Reception",
                    "🛠 Maintenance",
                    "🍽 Outlets",
                  ].map((x) => (
                    <div
                      key={x}
                      className={clsx(
                        "rounded-2xl px-4 py-3 text-sm font-semibold",
                        "bg-white/[0.06] ring-1 ring-white/10"
                      )}
                    >
                      {x}
                    </div>
                  ))}
                </div>

                <div className="mt-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section title={c.challengeTitle}>
        <div className="grid gap-3 md:grid-cols-2">
          {c.challenges.map((p) => (
            <div
              key={p.title}
              className={clsx(
                "rounded-3xl p-5",
                theme.panel,
                theme.ring,
                "hover:bg-white/[0.07] transition"
              )}
            >
              <div className="text-base font-semibold text-white">{p.title}</div>
              <div className={clsx("mt-2 text-sm leading-relaxed", theme.muted)}>{p.text}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={c.solutionTitle}>
        <div className="grid gap-3 md:grid-cols-2">
          {[solutionLeft, solutionRight].map((col, idx) => (
            <div key={idx} className={clsx("rounded-3xl p-5", theme.panel, theme.ring)}>
              <BulletList items={col} theme={theme} columns={1} />
            </div>
          ))}
        </div>
      </Section>

      <Section title={c.howTitle} subtitle={c.howSubtitle}>
        <div className="grid gap-3 md:grid-cols-4">
          {c.howSteps.map((s, i) => (
            <div
              key={`${s.title}-${i}`}
              className={clsx(
                "rounded-3xl p-5",
                theme.panel,
                theme.ring,
                "hover:bg-white/[0.07] transition"
              )}
            >
              <div className={clsx("text-xs font-semibold", theme.muted2)}>Step {i + 1}</div>

              <div className="mt-2 text-base font-semibold text-white">
                {s.title.split("\n").map((line, idx) => (
                  <span key={idx} className="block">
                    {line}
                  </span>
                ))}
              </div>

              <div className={clsx("mt-2 text-sm leading-relaxed", theme.muted)}>{s.text}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={c.trustTitle} subtitle={c.trustSubtitle}>
        <div className={clsx("rounded-3xl p-5", theme.panel, theme.ring)}>
          <BulletList items={c.trustBullets} theme={theme} columns={2} />
        </div>
      </Section>

      <Section title={c.featuresTitle} subtitle={c.featuresSubtitle}>
        <div className="grid gap-3 md:grid-cols-3">
          {c.features.map((f) => (
            <div
              key={f.title}
              className={clsx(
                "rounded-3xl p-5",
                theme.panel,
                theme.ring,
                "hover:bg-white/[0.07] transition"
              )}
            >
              <div className="text-base font-semibold text-white">{f.title}</div>
              <div className={clsx("mt-2 text-sm leading-relaxed", theme.muted)}>{f.text}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={c.pricingTitle} subtitle={c.pricingSubtitle}>
        <div className={clsx("rounded-3xl p-6", theme.panel, theme.ringStrong)}>
          <div className="grid grid-cols-12 gap-6 items-stretch">
            <div className="col-span-12 md:col-span-7">
              <div className={clsx("h-full rounded-2xl p-5", "bg-white/[0.06] ring-1 ring-white/10")}>
                <div className={clsx("text-xs font-semibold", theme.muted2)}></div>

                <div className="mt-2 text-3xl font-semibold text-white">{c.pricingCard.price}</div>

                <div className="mt-5">
                  <div className="text-sm font-semibold text-white">
                    {c.pricingCard.includesTitle}
                  </div>
                  <div className="mt-3">
                    <BulletList items={c.pricingCard.includes} theme={theme} columns={1} />
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 md:col-span-5 flex flex-col h-full md:border-l md:border-white/10 md:pl-6">
              <div className={clsx("rounded-2xl p-5 pb-9", "bg-white/[0.06] ring-1 ring-white/10")}>
                <div className="text-sm font-semibold text-white">{c.pricingSide.title}</div>
                <div className="mt-3">
                  <BulletList items={c.pricingSide.items} theme={theme} columns={1} />
                </div>
              </div>

              <div className="h-6 md:h-10" />
              <div className="hidden md:block flex-1" />

              <div className={clsx("rounded-2xl p-5 pt-9", "bg-white/[0.06] ring-1 ring-white/10")}>
                <div className="text-sm font-semibold text-white">{c.pricingImpl.title}</div>
                <div className={clsx("mt-1 text-sm", theme.muted)}>{c.pricingImpl.text}</div>
              </div>
            </div>
          </div>

          <div className={clsx("mt-5 text-sm leading-relaxed", theme.muted)}>
            <div className="text-white font-semibold">{c.pricingCard.setup}</div>

            <div className="mt-2">
              <span className="text-white font-semibold">{c.pricingCard.variableLabel}</span>{" "}
              <span className="text-white font-semibold">{c.pricingCard.variableText}</span>
            </div>

            <div className="mt-2 space-y-1">
              {c.pricingCard.seasonalLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={mailto(`${brandName} — Pricing & demo`)}
              className={clsx(
                "inline-flex justify-center rounded-2xl px-4 py-3 text-sm font-semibold",
                theme.accentBg,
                theme.accentText,
                theme.accentRing,
                "hover:brightness-110 active:scale-[0.99] transition"
              )}
            >
              {c.pricingCard.cta}
            </a>

            <a
              href={hubUrlExample}
              className={clsx(
                "inline-flex justify-center rounded-2xl px-4 py-3 text-sm font-semibold",
                theme.panel,
                theme.ring,
                theme.panelHover,
                "transition"
              )}
            >
              {c.navDemo}
            </a>
          </div>
        </div>
      </Section>

      <Section title={c.faqTitle}>
        <Faq items={c.faqs} />
      </Section>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className={clsx(theme.muted)}>
              <span className="text-white font-semibold">{brandName}</span> — {c.footerTagline}
            </div>
            <div className={clsx(theme.muted)}>
              <span className={clsx(theme.muted2)}>Contact: </span>
              <a className="underline text-white" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-6 text-sm text-slate-400">
            <a href="/impressum" className="underline hover:text-white transition">Impressum</a>
            <a href="/datenschutz" className="underline hover:text-white transition">Datenschutz</a>
            <a href="/agb" className="underline hover:text-white transition">AGB</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function getCopy(lang: Lang): Copy {
  if (lang === "bg") {
    return {
      navDemo: "Виж демо",
      navCta: "Искам оферта",

      heroTitle: "Дигитален консиерж,\nкойто решава реални хотелски проблеми.",
      heroLines: [
        "Гостът сканира един общ QR код и потвърждава стаята си.",
        "Заявката отива директно към правилния отдел в системата.",
        "Персоналът работи в отделни staff екрани, а мениджърът вижда всичко.",
        "No app. Един ясен flow. Реални KPI за хотела.",
      ],
      heroBadges: ["One Shared QR", "No App", "Multi-language", "Department Routing"],

      challengeTitle: "Ежедневни предизвикателства в хотела",
      challenges: [
        {
          title: "Претоварена рецепция",
          text: "Малки заявки прекъсват резервации, продажби, отчети и контрол. Това бави целия хотел.",
        },
        {
          title: "Бавна вътрешна координация",
          text: "Когато една заявка минава през няколко човека, губят се време, приоритет и яснота.",
        },
        {
          title: "Липса на видимост",
          text: "Мениджърът често не вижда навреме колко заявки има, къде се бавят и кой отдел е претоварен.",
        },
        {
          title: "Разнородни гости и екипи",
          text: "Гостите очакват бързина и удобство, а персоналът има нужда от ясен и прост работен поток.",
        },
      ],

      solutionTitle: "Как помага дигиталният консиерж?",
      solutionBullets: [
        "Намалява натоварването на рецепцията в ежедневната работа.",
        "Изпраща гостовите заявки към правилния отдел в структуриран формат.",
        "Съкращава времето за реакция и изпълнение.",
        "Позволява на госта да използва хъба на своя език.",
        "Дава на staff екипа прост и ясен работен flow.",
        "Мениджърът вижда всички заявки и техните статуси на едно място.",
        "Работи с един общ QR код за всички стаи.",
        "Гостът потвърждава стаята си в самия хъб — без нужда от отделен QR за всяка стая.",
        "Поддържа хотелска информация, Wi-Fi, аутлети и резервационни точки.",
        "Позволява събиране на KPI: сканирания, потвърдени стаи, заявки, завършени заявки.",
        "Работи без app download — директно от браузъра.",
      ],

      howTitle: "Как работи StayHub?",
      howSubtitle: "Един ясен гостов flow и отделни работни екрани за персонала.",
      howSteps: [
        {
          title: "Гостът сканира \nедин общ QR код",
          text: "Не е нужен отделен QR код за всяка стая. Гостът отваря хъба от общия код.",
        },
        {
          title: "Гостът потвърждава \nсвоята стая",
          text: "Стаята се записва за устройството и всички следващи действия се отчитат към нея.",
        },
        {
          title: "Гостът подава \nструктурирана заявка",
          text: "Хавлии, поддръжка, рецепция, минибар, късен check-out и други — според логиката на хотела.",
        },
        {
          title: "Правилният отдел \nобработва заявката",
          text: "Housekeeping, maintenance, reception и manager виждат точните заявки и работят по статуси.",
        },
      ],

      trustTitle: "Защо работи в реален хотел",
      trustSubtitle:
        "Не добавяме хаос. Даваме прост guest flow, ясен staff flow и реална видимост за мениджмънта.",
      trustBullets: [
        "Един общ QR код вместо печат и поддръжка на код за всяка стая.",
        "Структурирани заявки вместо свободен чат и устни предавания.",
        "Всеки отдел вижда само своята работа, а мениджърът вижда цялата картина.",
        "Подходящо за сезонни и целогодишни хотели.",
      ],

      featuresTitle: "Ключови функции",
      featuresSubtitle:
        "Функции, които влияят директно на скоростта на обслужване и на вътрешната организация.",
      features: [
        {
          title: "Guest Hub",
          text: "QR отваряне, потвърждение на стая, Wi-Fi, инфо секция, отдели, аутлети и заявки от телефона на госта.",
        },
        {
          title: "Staff Hub",
          text: "Отделни PIN защитени екрани за reception, housekeeping и maintenance със статуси и известия.",
        },
        {
          title: "Manager Visibility",
          text: "Мениджърски екран с видимост върху всички заявки, натоварване по отдели и KPI база за отчети.",
        },
      ],

      pricingTitle: "Цена",
      pricingSubtitle: "Офертата зависи от мащаба на хотела и нивото на внедряване.",

      pricingCard: {
        price: "от €99 / месец",
        setup: "Setup: според хотел, данни, конфигурация, секции и внедряване.",
        includesTitle: "Какво включва",
        includes: [
          "Guest hub с брандинг на хотела",
          "One shared QR flow с потвърждение на стая",
          "Staff hubs за reception, housekeeping и maintenance",
          "Manager view",
          "Мултиезичен интерфейс",
          "Routing по отдели и статуси",
          "KPI tracking основа",
        ],
        variableLabel: "Офертата се влияе от:",
        variableText: "обхват, секции, брой outlets, request logic и ниво на настройка.",
        seasonalLines: [
          "Сезонни хотели могат да работят с подходящ operational модел.",
          "Допълнителни секции, KPI и custom логика могат да се надграждат.",
        ],
        cta: "Искам оферта",
      },

      pricingSide: {
        title: "Подходящо за:",
        items: [
          "Сезонни хотели",
          "Спа хотели",
          "All inclusive хотели",
          "Бутикови хотели",
          "Градски и бизнес хотели",
        ],
      },

      pricingImpl: {
        title: "Внедряване",
        text: "След onboarding формата и материалите StayHub се настройва според реалната оперативна логика на хотела.",
      },

      faqTitle: "FAQ",
      faqs: [
        {
          q: "Трябва ли отделен QR код за всяка стая?",
          a: "Не. StayHub работи с един общ QR код. Гостът потвърждава стаята си вътре в хъба.",
        },
        {
          q: "Трябва ли гостът да инсталира приложение?",
          a: "Не. StayHub работи директно в браузъра и може да се добави като app shortcut.",
        },
        {
          q: "Как заявките стигат до правилния отдел?",
          a: "Всяка заявка е свързана с конкретен отдел и влиза в базата данни. Staff hub-овете показват правилните заявки по отдел.",
        },
        {
          q: "Какво вижда мениджърът?",
          a: "Мениджърът вижда всички заявки, статусите им и KPI база за натоварване и реакция.",
        },
        {
          q: "Работи ли с един общ телефонен номер?",
          a: "Да. StayHub не разчита на телефонните номера за routing на заявките. Routing-ът е database-driven.",
        },
        {
          q: "Може ли хотелът да има собствена инфо секция?",
          a: "Да. Могат да се показват закуска, басейн, СПА, паркинг, Wi-Fi, emergency информация и други важни guest info блокове.",
        },
        {
          q: "Какви KPI се отчитат?",
          a: "Могат да се отчитат QR scans, hub open, room confirmed, request submitted, staff status updates и други събития.",
        },
        {
          q: "Може ли да се надгражда?",
          a: "Да. Могат да се добавят нови секции, нови request logic сценарии, нови KPI и допълнителни integrations.",
        },
      ],

      footerTagline: "дигитална система за по-бърз и ясен хотелски guest flow.",
      footerNote: "",
    };
  }

  if (lang === "de") {
    return {
      navDemo: "Demo ansehen",
      navCta: "Angebot anfragen",

      heroTitle: "Ein digitaler Concierge,\nder echte Hotelprobleme löst.",
      heroLines: [
        "Der Gast scannt einen gemeinsamen QR-Code und bestätigt sein Zimmer.",
        "Die Anfrage geht direkt an die richtige Abteilung im System.",
        "Das Team arbeitet in getrennten Staff-Screens und das Management sieht alles.",
        "Keine App. Ein klarer Flow. Reale KPI für das Hotel.",
      ],
      heroBadges: ["One Shared QR", "Keine App", "Mehrsprachig", "Department Routing"],

      challengeTitle: "Tägliche Herausforderungen im Hotel",
      challenges: [
        {
          title: "Überlastete Rezeption",
          text: "Kleine Gästeanfragen unterbrechen Reservierungen, Verkauf, Reporting und operative Kontrolle.",
        },
        {
          title: "Langsame interne Koordination",
          text: "Wenn eine Anfrage durch mehrere Personen geht, gehen Zeit, Priorität und Klarheit verloren.",
        },
        {
          title: "Fehlende Sichtbarkeit",
          text: "Das Management sieht oft zu spät, wie viele Anfragen offen sind, wo sich etwas staut und welche Abteilung überlastet ist.",
        },
        {
          title: "Unterschiedliche Gäste und Teams",
          text: "Gäste erwarten Schnelligkeit und Einfachheit, während das Team einen klaren und einfachen Arbeitsfluss braucht.",
        },
      ],

      solutionTitle: "Wie hilft der digitale Concierge?",
      solutionBullets: [
        "Entlastet die Rezeption im Tagesgeschäft.",
        "Leitet Gästeanfragen strukturiert an die richtige Abteilung weiter.",
        "Verkürzt Reaktions- und Bearbeitungszeiten.",
        "Erlaubt dem Gast die Nutzung in seiner Sprache.",
        "Gibt dem Team einen klaren Staff-Flow.",
        "Das Management sieht alle Anfragen und Status an einem Ort.",
        "Arbeitet mit einem gemeinsamen QR-Code für alle Zimmer.",
        "Der Gast bestätigt sein Zimmer direkt im Hub — kein eigener QR-Code pro Zimmer nötig.",
        "Unterstützt Hotelinformationen, Wi-Fi, Outlets und Reservierungspunkte.",
        "Ermöglicht KPI-Erfassung: Scans, bestätigte Zimmer, Requests, erledigte Requests.",
        "Funktioniert direkt im Browser — ohne App-Download.",
      ],

      howTitle: "Wie funktioniert StayHub?",
      howSubtitle: "Ein klarer Gästefluss und getrennte Arbeitsoberflächen für das Hotelteam.",
      howSteps: [
        {
          title: "Der Gast scannt \neinen gemeinsamen QR-Code",
          text: "Es ist kein separater QR-Code pro Zimmer nötig. Der Gast öffnet den Hub über einen gemeinsamen Code.",
        },
        {
          title: "Der Gast bestätigt \nsein Zimmer",
          text: "Das Zimmer wird für dieses Gerät gespeichert und alle weiteren Aktionen werden diesem Zimmer zugeordnet.",
        },
        {
          title: "Der Gast sendet \neine strukturierte Anfrage",
          text: "Handtücher, Wartung, Rezeption, Minibar, Late Check-out und weitere Services — abhängig von der Hotellogik.",
        },
        {
          title: "Die richtige Abteilung \nbearbeitet die Anfrage",
          text: "Housekeeping, Maintenance, Reception und Manager sehen die passenden Anfragen und Statusänderungen.",
        },
      ],

      trustTitle: "Warum es in echten Hotels funktioniert",
      trustSubtitle:
        "Wir bringen keinen neuen Chaos-Kanal. Wir liefern einen klaren Gäste-Flow, einen klaren Staff-Flow und echte Management-Sichtbarkeit.",
      trustBullets: [
        "Ein gemeinsamer QR-Code statt Druck und Pflege eines Codes pro Zimmer.",
        "Strukturierte Anfragen statt freiem Chat und mündlicher Weitergabe.",
        "Jede Abteilung sieht ihre Arbeit, das Management sieht das Gesamtbild.",
        "Geeignet für saisonale und ganzjährig geöffnete Hotels.",
      ],

      featuresTitle: "Schlüsselfunktionen",
      featuresSubtitle:
        "Funktionen, die Reaktionsgeschwindigkeit und interne Organisation direkt verbessern.",
      features: [
        {
          title: "Guest Hub",
          text: "QR-Öffnung, Zimmerbestätigung, Wi-Fi, Info-Bereich, Abteilungen, Outlets und Gästeanfragen direkt vom Telefon des Gastes.",
        },
        {
          title: "Staff Hub",
          text: "Getrennte PIN-geschützte Screens für Reception, Housekeeping und Maintenance mit Statuslogik und Benachrichtigungen.",
        },
        {
          title: "Manager Visibility",
          text: "Manager-Screen mit Sicht auf alle Anfragen, Abteilungsbelastung und KPI-Basis für Auswertung.",
        },
      ],

      pricingTitle: "Preis",
      pricingSubtitle: "Das Angebot hängt von Hotelgröße und Umsetzungsumfang ab.",

      pricingCard: {
        price: "ab €99 / Monat",
        setup: "Setup: je nach Hotel, Daten, Konfiguration, Sektionen und Implementierung.",
        includesTitle: "Was enthalten ist",
        includes: [
          "Guest Hub mit Hotel-Branding",
          "One shared QR Flow mit Zimmerbestätigung",
          "Staff Hubs für Reception, Housekeeping und Maintenance",
          "Manager View",
          "Mehrsprachige Oberfläche",
          "Abteilungsrouting und Status-Flow",
          "KPI-Tracking-Basis",
        ],
        variableLabel: "Das Angebot hängt ab von:",
        variableText: "Umfang, Sektionen, Anzahl der Outlets, Request-Logik und Grad der Individualisierung.",
        seasonalLines: [
          "Saisonhotels können mit passendem Betriebsmodell arbeiten.",
          "Zusätzliche Sektionen, KPI und Custom-Logik können später erweitert werden.",
        ],
        cta: "Angebot anfragen",
      },

      pricingSide: {
        title: "Geeignet für:",
        items: [
          "Saisonhotels",
          "Spa-Hotels",
          "All-Inclusive-Hotels",
          "Boutique-Hotels",
          "Stadt- und Businesshotels",
        ],
      },

      pricingImpl: {
        title: "Implementierung",
        text: "Nach Onboarding und gelieferten Materialien wird StayHub an die reale operative Logik des Hotels angepasst.",
      },

      faqTitle: "FAQ",
      faqs: [
        {
          q: "Braucht jedes Zimmer einen eigenen QR-Code?",
          a: "Nein. StayHub arbeitet mit einem gemeinsamen QR-Code. Der Gast bestätigt sein Zimmer direkt im Hub.",
        },
        {
          q: "Muss der Gast eine App installieren?",
          a: "Nein. StayHub läuft direkt im Browser und kann als App-Shortcut hinzugefügt werden.",
        },
        {
          q: "Wie gelangen Anfragen zur richtigen Abteilung?",
          a: "Jede Anfrage ist mit einer Abteilung verbunden und wird in der Datenbank gespeichert. Die Staff-Hubs zeigen die richtigen Anfragen pro Abteilung.",
        },
        {
          q: "Was sieht das Management?",
          a: "Das Management sieht alle Anfragen, ihre Status und eine KPI-Basis für Auslastung und Reaktionsfluss.",
        },
        {
          q: "Funktioniert es auch mit einer gemeinsamen Telefonnummer?",
          a: "Ja. StayHub nutzt keine Telefonnummern für das eigentliche Routing der Requests. Das Routing ist datenbankgesteuert.",
        },
        {
          q: "Kann das Hotel einen eigenen Info-Bereich haben?",
          a: "Ja. Frühstück, Pool, Spa, Parken, Wi-Fi, Notfallinformationen und andere Gastinfos können angezeigt werden.",
        },
        {
          q: "Welche KPI können erfasst werden?",
          a: "Zum Beispiel QR-Scans, Hub Open, Room Confirmed, Request Submitted, Staff-Statuswechsel und weitere Ereignisse.",
        },
        {
          q: "Kann das System später erweitert werden?",
          a: "Ja. Neue Sektionen, neue Request-Logik, neue KPI und weitere Integrationen können ergänzt werden.",
        },
      ],

      footerTagline: "digitale Lösung für einen schnelleren und klareren Hotel-Gästefluss.",
      footerNote: "",
    };
  }

  return {
    navDemo: "View demo",
    navCta: "Request quote",

    heroTitle: "A digital concierge\nthat solves real hotel problems.",
    heroLines: [
      "Guests scan one shared QR code and confirm their room.",
      "Requests go directly to the right department inside the system.",
      "Staff works in separate role-based screens and management sees everything.",
      "No app. One clear flow. Real KPI for the hotel.",
    ],
    heroBadges: ["One Shared QR", "No App", "Multi-language", "Department Routing"],

    challengeTitle: "Everyday hotel challenges",
    challenges: [
      {
        title: "Overloaded reception",
        text: "Small guest requests interrupt reservations, sales, reporting and operational control.",
      },
      {
        title: "Slow internal coordination",
        text: "When one request moves through several people, time, priority and clarity are lost.",
      },
      {
        title: "Lack of visibility",
        text: "Management often sees too late how many requests are open, where delays happen and which department is overloaded.",
      },
      {
        title: "Different guest and staff needs",
        text: "Guests expect speed and simplicity, while staff needs a clear and easy operational flow.",
      },
    ],

    solutionTitle: "How does the digital concierge help?",
    solutionBullets: [
      "Reduces daily reception workload.",
      "Routes guest requests to the correct department in a structured format.",
      "Shortens response and handling time.",
      "Lets guests use the hub in their own language.",
      "Gives staff a clear and simple operational flow.",
      "Manager sees all requests and statuses in one place.",
      "Works with one shared QR code for all rooms.",
      "Guest confirms the room inside the hub — no need for a separate QR per room.",
      "Supports hotel info, Wi-Fi, outlets and reservation points.",
      "Allows KPI tracking for scans, confirmed rooms, requests and completed requests.",
      "Works directly in the browser with no app download.",
    ],

    howTitle: "How does StayHub work?",
    howSubtitle: "One clear guest flow and dedicated working screens for the hotel team.",
    howSteps: [
      {
        title: "Guest scans \none shared QR code",
        text: "There is no need for a separate QR per room. The guest opens the hub from a shared code.",
      },
      {
        title: "Guest confirms \nthe room",
        text: "The room is stored for that device and all next actions are linked to it.",
      },
      {
        title: "Guest submits \na structured request",
        text: "Towels, maintenance, reception, minibar, late checkout and more — based on the hotel’s own logic.",
      },
      {
        title: "The right department \nhandles the request",
        text: "Housekeeping, maintenance, reception and manager all see the right requests and status flow.",
      },
    ],

    trustTitle: "Why it works in a real hotel",
    trustSubtitle:
      "We do not add more chaos. We deliver a clear guest flow, a clear staff flow and real management visibility.",
    trustBullets: [
      "One shared QR code instead of printing and managing one code per room.",
      "Structured requests instead of free chat and verbal handover.",
      "Each department sees its own work, while management sees the full picture.",
      "Suitable for both seasonal and year-round hotels.",
    ],

    featuresTitle: "Key features",
    featuresSubtitle:
      "Features that directly improve response speed and internal hotel organisation.",
    features: [
      {
        title: "Guest Hub",
        text: "QR opening, room confirmation, Wi-Fi, info section, departments, outlets and guest requests from the guest’s phone.",
      },
      {
        title: "Staff Hub",
        text: "Separate PIN-protected screens for reception, housekeeping and maintenance with status handling and alerts.",
      },
      {
        title: "Manager Visibility",
        text: "Manager screen with visibility across all requests, department workload and KPI base for reporting.",
      },
    ],

    pricingTitle: "Pricing",
    pricingSubtitle: "The final offer depends on hotel scope and implementation level.",

    pricingCard: {
      price: "from €99 / month",
      setup: "Setup: depends on hotel scope, data, configuration, sections and implementation.",
      includesTitle: "What is included",
      includes: [
        "Guest hub with hotel branding",
        "One shared QR flow with room confirmation",
        "Staff hubs for reception, housekeeping and maintenance",
        "Manager view",
        "Multi-language interface",
        "Department routing and status flow",
        "KPI tracking base",
      ],
      variableLabel: "The offer depends on:",
      variableText: "scope, sections, number of outlets, request logic and customisation level.",
      seasonalLines: [
        "Seasonal hotels can work with an appropriate operational model.",
        "Additional sections, KPI and custom logic can be expanded later.",
      ],
      cta: "Request quote",
    },

    pricingSide: {
      title: "Best for:",
      items: [
        "Seasonal hotels",
        "Spa hotels",
        "All-inclusive hotels",
        "Boutique hotels",
        "City and business hotels",
      ],
    },

    pricingImpl: {
      title: "Implementation",
      text: "After onboarding and materials, StayHub is configured around the real operational logic of the hotel.",
    },

    faqTitle: "FAQ",
    faqs: [
      {
        q: "Does each room need its own QR code?",
        a: "No. StayHub works with one shared QR code. The guest confirms the room inside the hub.",
      },
      {
        q: "Does the guest need to install an app?",
        a: "No. StayHub runs directly in the browser and can be added as an app shortcut.",
      },
      {
        q: "How do requests reach the correct department?",
        a: "Each request is linked to a department and stored in the database. Staff hubs show the correct requests for each team.",
      },
      {
        q: "What does management see?",
        a: "Management sees all requests, their statuses and a KPI base for workload and response flow.",
      },
      {
        q: "Can it work with one shared phone number?",
        a: "Yes. StayHub does not depend on phone numbers for the actual routing. Routing is database-driven.",
      },
      {
        q: "Can the hotel have its own info section?",
        a: "Yes. Breakfast, pool, spa, parking, Wi-Fi, emergency and other guest info blocks can be shown.",
      },
      {
        q: "What KPI can be tracked?",
        a: "For example QR scans, hub open, room confirmed, request submitted, staff status updates and more.",
      },
      {
        q: "Can the system be expanded later?",
        a: "Yes. New sections, new request logic, new KPI and additional integrations can be added.",
      },
    ],

    footerTagline: "a digital system for a faster and clearer hotel guest flow.",
    footerNote: "",
  };
}