// components/marketing/MarketingPage.tsx
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
  hubUrlExample = "/h/demo?room=101",
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

  // --- Theme (Modern Reliable Boutique + Lavender) ---
  const theme = {
    topbar: "bg-[#0D1B2A]/70",
    panel: "bg-white/[0.05]",
    panelHover: "hover:bg-white/[0.07]",
    ring: "ring-1 ring-white/10",
    ringStrong: "ring-1 ring-white/14",
    text: "text-white",
    muted: "text-slate-300",
    muted2: "text-slate-400",

    // Lavender (primary accent now)
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
      {/* ✅ FULL-PAGE VIGNETTE / EDGE FADE EFFECT */}
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

      {/* Top bar */}
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
              <div className={clsx("text-xs", theme.muted2)}>QR • WhatsApp • No App</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* ✅ FIX: Demo link */}
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

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pt-12 pb-6 relative z-10">
        <div className="grid gap-6 md:grid-cols-2 md:items-center">
          <div>
            {/* ✅ FIX: controlled line break */}
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl tracking-tight">
              {c.heroTitle.split("\n").map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </h1>

            {/* 4 lines, one under another */}
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

              {/* ✅ FIX: Demo link */}
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

          {/* Visual preview card */}
          <div className="flex md:justify-end">
            <div
              className={clsx("rounded-3xl overflow-hidden", theme.panel, theme.ringStrong)}
              style={{ width: 320, maxWidth: "100%" }}
            >
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{brandName} — Demo</div>
                    <div className={clsx("mt-1 text-xs", theme.muted2)} />
                  </div>
                  <div
                    className={clsx(
                      "shrink-0 rounded-xl px-3 py-1 text-xs font-semibold",
                      theme.accentSoft,
                      theme.accentSoftRing
                    )}
                  >
                    Room 101
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  {[
                    "📶 WiFi",
                    "🧺 Housekeeping",
                    "🛎 Reception",
                    "🛠 Maintenance",
                    "🍽 Restaurant",
                    "🎟 Events",
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

      {/* Challenges */}
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

      {/* Solution */}
      <Section title={c.solutionTitle}>
        <div className="grid gap-3 md:grid-cols-2">
          {[solutionLeft, solutionRight].map((col, idx) => (
            <div key={idx} className={clsx("rounded-3xl p-5", theme.panel, theme.ring)}>
              <BulletList items={col} theme={theme} columns={1} />
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section title={c.howTitle} subtitle={c.howSubtitle}>
        <div className="grid gap-3 md:grid-cols-3">
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

              {/* ✅ FIX: controlled line break for step titles */}
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

      {/* Trust */}
      <Section title={c.trustTitle} subtitle={c.trustSubtitle}>
        <div className={clsx("rounded-3xl p-5", theme.panel, theme.ring)}>
          <BulletList items={c.trustBullets} theme={theme} columns={2} />
        </div>
      </Section>

      {/* Key Features */}
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

      {/* Pricing (clean layout, bottoms aligned, real separation) */}
      <Section title={c.pricingTitle} subtitle={c.pricingSubtitle}>
        <div className={clsx("rounded-3xl p-6", theme.panel, theme.ringStrong)}>
          {/* TOP: left big card + right stacked cards */}
          <div className="grid grid-cols-12 gap-6 items-stretch">
            {/* LEFT BIG CARD */}
            <div className="col-span-12 md:col-span-7">
              <div className={clsx("h-full rounded-2xl p-5", "bg-white/[0.06] ring-1 ring-white/10")}>
                <div className={clsx("text-xs font-semibold", theme.muted2)}>
                  {lang === "bg"
                    ? ""
                    : lang === "de"
                      ? ""
                      : ""}
                </div>

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

            {/* RIGHT COLUMN */}
            <div className="col-span-12 md:col-span-5 flex flex-col h-full md:border-l md:border-white/10 md:pl-6">
              {/* top right card */}
              <div className={clsx("rounded-2xl p-5 pb-9", "bg-white/[0.06] ring-1 ring-white/10")}>
                <div className="text-sm font-semibold text-white">{c.pricingSide.title}</div>
                <div className="mt-3">
                  <BulletList items={c.pricingSide.items} theme={theme} columns={1} />
                </div>
              </div>

              {/* real gap between cards */}
              <div className="h-6 md:h-10" />

              {/* push bottom card down ONLY on desktop to align bottoms */}
              <div className="hidden md:block flex-1" />

              {/* bottom right card */}
              <div className={clsx("rounded-2xl p-5 pt-9", "bg-white/[0.06] ring-1 ring-white/10")}>
                <div className="text-sm font-semibold text-white">{c.pricingImpl.title}</div>
                <div className={clsx("mt-1 text-sm", theme.muted)}>{c.pricingImpl.text}</div>
              </div>
            </div>
          </div>

          {/* FULL WIDTH text block under both columns */}
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

          {/* Buttons */}
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

            {/* ✅ FIX: Demo link */}
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

      {/* FAQ */}
      <Section title={c.faqTitle}>
        <Faq items={c.faqs} />
      </Section>

      {/* Footer */}
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

          {/* ✅ Legal links */}
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

      heroTitle: "Дигитален консиерж,\nкойто решава проблеми.",
      heroLines: [
        "Гостът сканира QR кода от картата и избира услуга.",
        "Заявката отива към съответния отдел през WhatsApp.",
        "Гостът остава доволен и оставя положителна рецензия.",
        "No app. No training. Works with WhatsApp.",
      ],
      heroBadges: ["No App", "WhatsApp", "Multi-language", "Department routing"],

      challengeTitle: "Ежедневни предизвикателства в хотела",
      challenges: [
        {
          title: "Претоварена рецепция",
          text: "Дребни заявки прекъсват работата по резервации, отчети и контрол - а заетостта в хотела зависи от скоростта на реакция.",
        },
        {
          title: "Хиляди въпроси от гостите",
          text: "„Само една хавлия“ е малка заявка, но забавянето води до оплакване. Скоростта е част от преживяването.",
        },
        {
          title: "Затруднена комуникация между отделите",
          text: "Когато заявката мине през няколко човека — губи се време, приоритети и концентрация.",
        },
        {
          title: "Мултиезикови различия",
          text: "Има езикови и културни бариери между интернационален персонал, местен мениджмънт и гости на хотела.",
        },
      ],

      solutionTitle: "Как помага дигиталният консиерж?",
      solutionBullets: [
        "Намалява натовареността на рецепцията през деня.",
        "Заявките на гостите се изпращат директно към съответния отдел.",
        "Съкращава времето за обработка на заявките на гостите.",
        "Говори на езика на гостите чрез мултиезично меню + оперативен език за персонала.",
        "Лесен за използване - всички секции са ясни и разбираеми.",
        "WhatsApp се отваря с готов текст + номер на стая — без свободен чат и без объркване.",
        "Извън работно време за определен отдел, заявката се пренасочва към рецепция + гостът получава уведомление.",
        "Ресторантски резервации: няма изпращане без дата, час, брой хора и повод.",
        "Показва всички възможни атракции в района на хотела.",
        "Дава информация за всички мероприятия за деня или седмицата.",
        "Дава възможност за незабавна рецензия в големите платформи - Google, Booking, Tripadvisor.",
      ],

      howTitle: "Как работи дигиталния консиерж?",
      howSubtitle: "Дигиталния консиерж е връзката между оперативните процеси и обслужването на гостите.",
      howSteps: [
        {
          title: "Гостът сканира QR кода \nна картата с номера на стаята си",
          text: "Показват се ясни и точни отдели, контакти, работни часове, услуги, езици.",
        },
        {
          title: "Гостът избира секция \nи услугата, от която има нужда",
          text: "Във всяка секция са описани услугите и допълнителна информация за всеки отдел",
        },
        {
          title: "Информацията се изпраща през WhatsApp към точния отдел",
          text: "Съобщението е ясно и точно според услугата и езика на персонала",
        },
      ],

      trustTitle: "Защо работи в реален хотел",
      trustSubtitle:
        "Не добавяме „още един софтуер“. Даваме прост процес и ясни заявки, които стигат навреме.",
      trustBullets: [
        "Познато за екипа: WhatsApp Messenger вместо нова система за обучение.",
        "Стандартизирани заявки → по-малко грешки и по-малко повторения.",
        "Отделите не се „гонят“ по телефона — получават точна заявка с номер на стая.",
        "Може да се настройва по хотел: услуги, езици, работни часове, секции.",
      ],

      featuresTitle: "Ключови функции",
      featuresSubtitle:
        "Функции, които влияят на скоростта на обслужване и на качеството на комуникацията в хотела.",
      features: [
        {
          title: "Routing по отдели и работно време",
          text: "Настройваме часовете. Ако отделът е затворен, системата прехвърля към рецепция и информира госта веднага.",
        },
        {
          title: "Мултиезичност + оперативен език",
          text: "Гостът ползва хъба на своя език. Съобщението към персонала пристига на езика на хотела.",
        },
        {
          title: "Контрол на заявки",
          text: "Бутоните държат процеса чист и предвидим както за госта, така и за персонала.",
        },
      ],

      pricingTitle: "Цена",
      pricingSubtitle: "Финалната оферта се напасва само според броя стаи и физическите QR карти.",
      pricingCard: {
        price: "€99 / месец",
        setup: "Setup: €299 (еднократно) — настройка, демо, внедряване.",
        includesTitle: "Какво включва",
        includes: [
          "Хъб за хотела (мултиезичен) + ваш брандинг",
          "QR линкове с номер на стая в URL",
          "Персонално настройване на отдели, работно време, автоматично пренасочване към рецепция",
          "Поддръжка на текстове по отдели според стандартите на хотела",
          "Седмичен отчет за клиентско взаимодействие ",
        ],
        variableLabel: "Физически QR карти:",
        variableText: "цената се определя според броя стаи/карти (минимум 3 карти на стая).",
        seasonalLines: [
          "Сезонни хотели: има опция за пауза в месеците, когато хотелът е затворен.",
          "Преди новия сезон — подновяване и обновяване на съдържанието по стандартна такса.",
        ],
        cta: "Искам оферта",
      },

      pricingSide: {
        title: "Подходящо за:",
        items: [
          "Сезонни хотели (с опция за пауза)",
          "Спа и балнео хотели",
          "All inclusive хотели",
          "Градски и бизнес хотели",
        ],
      },

      pricingImpl: {
        title: "Внедряване",
        text: "Обичайно 10–15 работни дни след onboarding формата + материали.",
      },

      faqTitle: "FAQ",
      faqs: [
        {
          q: "За кого е продуктът?",
          a: "За хотели, които искат по-бърза реакция към гостите, по-малко прекъсвания на рецепция и по-ясна комуникация между отделите.",
        },
        { q: "Гостът трябва ли да инсталира приложение?", a: "Не. Сканира QR кода и използва браузър + WhatsApp." },
        {
          q: "Как се гарантира, че заявките отиват към правилния отдел?",
          a: "Всеки бутон е обвързан с отдел. Ако отделът не работи, заявката се прехвърля към рецепция и гостът вижда уведомление веднага.",
        },
        { q: "Ресторантските резервации как се контролират?", a: "Не позволява изпращане без час и брой хора — събираме ги като задължителни полета." },
        { q: "Може ли още езици освен BG/DE/EN?", a: "Да. Добавяме допълнителни езици при нужда. Оперативният език към персонала остава този, който хотелът избере." },
        { q: "Какво включва цената €99/месец?", a: "Хостнат хъб, поддръжка, конфигурация на отдели/часове/шаблони, мултиезичност и структурирани заявки към WhatsApp." },
        { q: "Какво е еднократният setup?", a: "Настройка на хотела, демо, структуриране на секции, правила, работни часове и подготовка за go-live." },
        { q: "Сезонен хотел сме — може ли пауза?", a: "Да. Пауза в месеците без работа. Преди сезон правим подновяване и обновяване на съдържание по стандартна такса." },
        { q: "Колко време отнема внедряването?", a: "Обичайно 3–5 работни дни след onboarding формата и получени материали (лого, контакти, часове, услуги)." },
      ],
      
      footerTagline: "дигитална система за по-бързо обслужване на гостите в хотела.",
      footerNote: "",
    };
  }

  if (lang === "de") {
    return {
      navDemo: "Demo ansehen",
      navCta: "Angebot anfragen",

      heroTitle: "Digitaler Concierge,\nder Probleme löst.",
      heroLines: [
        "Der Gast scannt den QR-Code auf der Karte und wählt eine Leistung.",
        "Die Anfrage geht per WhatsApp direkt an die richtige Abteilung.",
        "Der Gast ist zufrieden und hinterlässt eine positive Bewertung.",
        "No app. No training. Works with WhatsApp.",
      ],
      heroBadges: ["Keine App", "WhatsApp", "Mehrsprachig", "Abteilungs-Routing"],

      challengeTitle: "Tägliche Herausforderungen im Hotel",
      challenges: [
        {
          title: "Überlastete Rezeption",
          text: "Kleinanfragen unterbrechen Reservierungen, Reporting und Kontrolle – dabei hängt die Auslastung stark von der Reaktionsgeschwindigkeit ab.",
        },
        {
          title: "Tausende Fragen von Gästen",
          text: "„Nur ein Handtuch“ ist klein – aber Verzögerungen werden schnell zu Beschwerden. Geschwindigkeit ist Teil der Guest Experience.",
        },
        {
          title: "Schwierige Kommunikation zwischen Abteilungen",
          text: "Wenn eine Anfrage durch mehrere Personen läuft, geht Zeit verloren – und oft auch Priorität und Fokus.",
        },
        {
          title: "Mehrsprachigkeit & Kulturunterschiede",
          text: "Sprach- und Kulturbarrieren zwischen internationalem Team, lokalem Management und Hotelgästen sorgen für Reibung.",
        },
      ],

      solutionTitle: "Wie hilft der digitale Concierge?",
      solutionBullets: [
        "Entlastet die Rezeption im Tagesgeschäft.",
        "Gästeanfragen gehen direkt an die zuständige Abteilung.",
        "Verkürzt die Bearbeitungszeit von Requests spürbar.",
        "Spricht die Sprache der Gäste (mehrsprachiges Menü) + operative Sprache fürs Team.",
        "Einfach zu nutzen – alle Bereiche sind klar und verständlich.",
        "WhatsApp öffnet sich mit fertigem Text + Zimmernummer – kein freier Chat, kein Chaos.",
        "Außerhalb der Arbeitszeit einer Abteilung: Weiterleitung zur Rezeption + Hinweis an den Gast.",
        "Restaurant-Reservierungen: kein Senden ohne Datum, Uhrzeit, Personenzahl und Anlass.",
        "Zeigt mögliche Attraktionen in der Umgebung des Hotels.",
        "Informiert über Events für den Tag oder die Woche.",
        "Ermöglicht sofortige Bewertungen auf großen Plattformen: Google, Booking, Tripadvisor.",
      ],

      howTitle: "Wie funktioniert der digitale Concierge?",
      howSubtitle: "Der digitale Concierge verbindet operative Abläufe mit dem Gästeservice – simpel und messbar.",
      howSteps: [
        {
          title: "Der Gast scannt den QR-Code \nauf der Karte mit seiner Zimmernummer",
          text: "Er sieht klare Bereiche, Kontakte, Öffnungszeiten, Services, Sprachen.",
        },
        {
          title: "Der Gast wählt den Bereich \nund die gewünschte Leistung",
          text: "Jeder Bereich enthält passende Optionen und zusätzliche Infos pro Abteilung.",
        },
        {
          title: "Die Information wird per WhatsApp \nan die richtige Abteilung gesendet",
          text: "Die Nachricht ist standardisiert – klar, vollständig und in der operativen Hotelsprache.",
        },
      ],

      trustTitle: "Warum es im echten Hotel funktioniert",
      trustSubtitle:
        "Wir fügen nicht „noch eine Software“ hinzu. Wir liefern einen einfachen Prozess und klare Requests, die pünktlich ankommen.",
      trustBullets: [
        "Vertraut fürs Team: WhatsApp statt neues System mit Schulungsaufwand.",
        "Standardisierte Requests → weniger Fehler, weniger Rückfragen.",
        "Abteilungen bekommen klare Requests mit Zimmernummer – kein Telefon-Ping-Pong.",
        "Pro Hotel konfigurierbar: Services, Sprachen, Arbeitszeiten, Sektionen.",
      ],

      featuresTitle: "Schlüsselfunktionen",
      featuresSubtitle:
        "Funktionen, die Reaktionszeit verbessern und die Qualität der internen Kommunikation im Hotel erhöhen.",
      features: [
        {
          title: "Routing nach Abteilung & Arbeitszeiten",
          text: "Wir setzen Zeiten. Wenn eine Abteilung geschlossen ist, wird automatisch zur Rezeption geroutet und der Gast sofort informiert.",
        },
        {
          title: "Mehrsprachig + operative Sprache",
          text: "Der Gast nutzt den Hub in seiner Sprache. Die Nachricht ans Team kommt in der Hotelsprache an.",
        },
        {
          title: "Kontrollierte Requests",
          text: "Buttons und Pflichtfelder halten den Prozess sauber und vorhersehbar – für Gast und Team.",
        },
      ],

      pricingTitle: "Preis",
      pricingSubtitle: "Das finale Angebot richtet sich nur nach Zimmeranzahl und physischen QR-Karten.",
      pricingCard: {
        price: "€99 / Monat",
        setup: "Setup: €299 (einmalig) — Einrichtung, Demo, Implementierung.",
        includesTitle: "Enthalten",
        includes: [
          "Hotel-Hub (mehrsprachig) + Ihr Branding",
          "QR-Links mit Zimmernummer in der URL",
          "Individuelle Einrichtung von Abteilungen, Arbeitszeiten, automatischem Routing zur Rezeption",
          "Pflege der Abteilungstexte nach Ihren Hotel-Standards",
          "Wöchentlicher Report zur Guest-Interaktion",
        ],
        variableLabel: "Physische QR-Karten:",
        variableText: "Preis nach Zimmern/Karten (mind. 3 Karten pro Zimmer).",
        seasonalLines: [
          "Saisonhotels: Pause in Monaten möglich, in denen das Hotel geschlossen ist.",
          "Vor Saisonstart: Reaktivierung + Content-Update gegen Standardgebühr.",
        ],
        cta: "Angebot anfragen",
      },

      pricingSide: {
        title: "Geeignet für:",
        items: ["Saisonhotels (mit Pause-Option)", "Spa- & Wellnesshotels", "All-Inclusive-Hotels", "City- & Businesshotels"],
      },

      pricingImpl: {
        title: "Implementierung",
        text: "Üblich: 10–15 Werktage nach Onboarding-Formular + Materialien.",
      },

      faqTitle: "FAQ",
      faqs: [
        {
          q: "Für wen ist das Produkt?",
          a: "Für Hotels, die schneller reagieren wollen, weniger Unterbrechungen an der Rezeption brauchen und eine klare Abteilungs-Kommunikation möchten.",
        },
        { q: "Muss der Gast eine App installieren?", a: "Nein. QR scannen → Browser → WhatsApp." },
        {
          q: "Wie wird sichergestellt, dass Requests zur richtigen Abteilung gehen?",
          a: "Jeder Button ist einer Abteilung zugeordnet. Wenn die Abteilung nicht arbeitet, wird automatisch zur Rezeption geroutet und der Gast sieht sofort einen Hinweis.",
        },
        {
          q: "Wie werden Restaurant-Reservierungen kontrolliert?",
          a: "Kein Senden ohne Uhrzeit und Personenzahl – wir erfassen sie als Pflichtfelder.",
        },
        {
          q: "Sind weitere Sprachen außer BG/DE/EN möglich?",
          a: "Ja. Wir fügen weitere Sprachen hinzu. Die operative Sprache für das Team bleibt die, die das Hotel festlegt.",
        },
        {
          q: "Was ist in €99/Monat enthalten?",
          a: "Gehosteter Hub, Support, Konfiguration von Abteilungen/Zeiten/Templates, Mehrsprachigkeit und strukturierte WhatsApp-Requests.",
        },
        {
          q: "Was ist das einmalige Setup?",
          a: "Einrichtung des Hotels, Demo, Strukturierung der Sektionen, Regeln, Arbeitszeiten und Vorbereitung für Go-Live.",
        },
        {
          q: "Wir sind ein Saisonhotel – ist eine Pause möglich?",
          a: "Ja. Pause in Monaten ohne Betrieb. Vor Saisonstart machen wir Reaktivierung und Content-Update gegen Standardgebühr.",
        },
        {
          q: "Wie lange dauert die Implementierung?",
          a: "Üblich: 10–15 Werktage nach Onboarding-Formular und Materialien (Logo, Kontakte, Zeiten, Services).",
        },
      ],

      footerTagline: "schneller digitaler Gästeservice.",
      footerNote: "",
    };
  }

  // EN
  return {
    navDemo: "View demo",
    navCta: "Request quote",

    heroTitle: "A digital concierge\nthat solves problems.",
    heroLines: [
      "Guests scan the QR code on the card and choose a service.",
      "The request goes to the right department via WhatsApp.",
      "Guests stay happy and leave a positive review.",
      "No app. No training. Works with WhatsApp.",
    ],
    heroBadges: ["No App", "WhatsApp", "Multi-language", "Department routing"],

    challengeTitle: "Everyday challenges in a hotel",
    challenges: [
      {
        title: "Overloaded reception",
        text: "Small requests interrupt reservations, reporting and control — and occupancy depends on response speed.",
      },
      {
        title: "Thousands of guest questions",
        text: "“Just one towel” is small, but delays turn into complaints. Speed is part of the experience.",
      },
      {
        title: "Hard communication between departments",
        text: "When a request passes through multiple people, you lose time, priority and focus.",
      },
      {
        title: "Language & cultural differences",
        text: "Language and cultural barriers between international staff, local management and hotel guests create friction.",
      },
    ],

    solutionTitle: "How does the digital concierge help?",
    solutionBullets: [
      "Reduces reception workload during the day.",
      "Guest requests go directly to the correct department.",
      "Cuts down request handling time significantly.",
      "Speaks the guest’s language (multi-language menu) + an operating language for staff.",
      "Easy to use — all sections are clear and understandable.",
      "WhatsApp opens with ready text + room number — no free chat and no confusion.",
      "Outside a department’s working hours, requests route to reception and the guest gets notified.",
      "Restaurant reservations: no sending without date, time, party size and occasion.",
      "Shows available attractions in the hotel area.",
      "Provides information about events for the day or the week.",
      "Enables instant reviews on major platforms: Google, Booking, Tripadvisor.",
    ],

    howTitle: "How does the digital concierge work?",
    howSubtitle: "The digital concierge links operations with guest service — simple, structured, and fast.",
    howSteps: [
      {
        title: "Guest scans the QR code \non the card with their room number",
        text: "They see clear departments, contacts, opening hours, services, and languages.",
      },
      {
        title: "Guest selects a section \nand the service they need",
        text: "Each section contains the right options and extra information for that department.",
      },
      {
        title: "Info is sent via WhatsApp \nto the correct department",
        text: "The message is standardized — clear, complete, and in the hotel’s operating language.",
      },
    ],

    trustTitle: "Why it works in a real hotel",
    trustSubtitle:
      "We don’t add “another software”. We deliver a simple process and clear requests that arrive on time.",
    trustBullets: [
      "Familiar for teams: WhatsApp instead of a new system to learn.",
      "Standardized requests → fewer mistakes and fewer follow-up questions.",
      "Departments get a clear request with room number — no phone ping-pong.",
      "Configurable per hotel: services, languages, working hours, sections.",
    ],

    featuresTitle: "Key functions",
    featuresSubtitle: "Functions that improve response speed and the quality of communication inside the hotel.",
    features: [
      {
        title: "Routing by department and working hours",
        text: "We set schedules. If a department is closed, the system routes to reception and informs the guest instantly.",
      },
      {
        title: "Multi-language + operating language",
        text: "Guests use the hub in their language. Staff receives messages in the hotel’s operating language.",
      },
      {
        title: "Controlled requests",
        text: "Buttons and required fields keep the process clean and predictable — for guests and staff.",
      },
    ],

    pricingTitle: "Price",
    pricingSubtitle: "The final quote depends only on room count and physical QR cards.",
    pricingCard: {
      price: "€99 / month",
      setup: "Setup: €299 (one-time) — setup, demo, implementation.",
      includesTitle: "What’s included",
      includes: [
        "Hotel hub (multi-language) + your branding",
        "QR links with room number in the URL",
        "Custom setup of departments, working hours, automatic routing to reception",
        "Text/content support per department based on your hotel standards",
        "Weekly guest interaction report",
      ],
      variableLabel: "Physical QR cards:",
      variableText: "priced by rooms/cards (minimum 3 cards per room).",
      seasonalLines: [
        "Seasonal hotels: pause option during months when the hotel is closed.",
        "Before the new season: reactivation and content updates for a standard fee.",
      ],
      cta: "Request quote",
    },

    pricingSide: {
      title: "Best for:",
      items: ["Seasonal hotels (pause option)", "Spa & wellness hotels", "All-inclusive hotels", "City & business hotels"],
    },

    pricingImpl: {
      title: "Implementation",
      text: "Usually 10–15 business days after onboarding form + materials.",
    },

    faqTitle: "FAQ",
    faqs: [
      {
        q: "Who is this for?",
        a: "Hotels that want faster guest response, fewer reception interruptions, and clearer communication between departments.",
      },
      { q: "Does the guest need to install an app?", a: "No. Scan QR → browser → WhatsApp." },
      {
        q: "How do you ensure requests go to the right department?",
        a: "Each button is mapped to a department. If it’s outside working hours, the request routes to reception and the guest sees a notification immediately.",
      },
      {
        q: "How are restaurant reservations controlled?",
        a: "Guests can’t send without time and number of guests — those are required fields.",
      },
      {
        q: "Can we add more languages than BG/DE/EN?",
        a: "Yes. We can add more languages. The operating language for staff stays what the hotel chooses.",
      },
      {
        q: "What’s included in €99/month?",
        a: "Hosted hub, support, department/hours/templates setup, multi-language UI, and structured WhatsApp requests.",
      },
      {
        q: "What is the one-time setup?",
        a: "Hotel setup, demo, section structure, rules, working hours, and go-live preparation.",
      },
      {
        q: "We are seasonal — can we pause?",
        a: "Yes. Pause during off-season months. Before the season we reactivate and update content for a standard fee.",
      },
      {
        q: "How long does implementation take?",
        a: "Typically 10–15 business days after the onboarding form and assets (logo, contacts, hours, services).",
      },
    ],

    footerTagline: "smart technology for faster hotel services.",
    footerNote: "",
  };
}
