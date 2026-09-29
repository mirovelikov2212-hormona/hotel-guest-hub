"use client";

import { useEffect, useMemo, useState } from "react";

import {
  GUEST_APP_INSTALLED_EVENT,
  GUEST_INSTALL_PROMPT_EVENT,
  clearGuestInstallPrompt,
  getGuestInstallPrompt,
  guestInstallBrowserFamily,
  isAppleMobileDevice,
  isStandaloneDisplayMode,
  wasGuestAppInstalled,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-prompt";
import { trackHubEvent } from "@/lib/trackHubEvent";

type UiLang = "bg" | "en" | "de" | "ro" | "cs" | "ru";

type InstallCopy = {
  title: string;
  readyHint: string;
  iosHint: string;
  browserHint: string;
  installedTitle: string;
  installedHint: string;
  helpTitle: string;
  iosSteps: string[];
  chromeSteps: string[];
  samsungSteps: string[];
  otherSteps: string[];
  close: string;
};

function InstallDeviceIcon() {
  return (
    <span className="stayhub-install-icon" aria-hidden="true">
      <img
        src="/icons/guesthub-premium/install.png?v=20260719-final-icons"
        alt=""
        draggable={false}
        decoding="async"
        className="stayhub-action-icon-image stayhub-action-icon-brand"
      />
    </span>
  );
}

const COPY: Record<UiLang, InstallCopy> = {
  bg: {
    title: "Изтегли приложението",
    readyHint: "Натиснете тук за инсталиране",
    iosHint: "Ще ви покажем стъпките за iPhone/iPad",
    browserHint: "Ще ви покажем как да го добавите на телефона",
    installedTitle: "Приложението е инсталирано",
    installedHint: "Отваряйте GOSTAYA от началния екран",
    helpTitle: "Добавете GOSTAYA на началния екран",
    iosSteps: [
      "Отворете менюто Споделяне в Safari.",
      "Изберете „Добавяне към началния екран“.",
      "Ако виждате „Отваряне като уеб приложение“, оставете го включено.",
      "Натиснете „Добавяне“.",
    ],
    chromeSteps: [
      "Отворете менюто на браузъра (⋮).",
      "Изберете „Инсталиране на приложението“ или „Добавяне към началния екран“.",
      "Потвърдете с „Инсталиране“ / „Добавяне“.",
    ],
    samsungSteps: [
      "Отворете менюто на Samsung Internet (☰).",
      "Изберете „Добавяне на страница към“.",
      "Изберете „Начален екран“ и потвърдете.",
    ],
    otherSteps: [
      "Отворете менюто на браузъра.",
      "Потърсете „Инсталиране на приложението“ или „Добавяне към началния екран“.",
      "Потвърдете добавянето.",
    ],
    close: "Затвори",
  },
  en: {
    title: "Download the app",
    readyHint: "Tap here to install",
    iosHint: "We’ll show the iPhone/iPad steps",
    browserHint: "We’ll show how to add it to your phone",
    installedTitle: "App installed",
    installedHint: "Open GOSTAYA from your Home Screen",
    helpTitle: "Add GOSTAYA to your Home Screen",
    iosSteps: [
      "Open the Share menu in Safari.",
      "Choose “Add to Home Screen”.",
      "If “Open as Web App” is shown, keep it enabled.",
      "Tap “Add”.",
    ],
    chromeSteps: [
      "Open the browser menu (⋮).",
      "Choose “Install app” or “Add to Home screen”.",
      "Confirm with “Install” / “Add”.",
    ],
    samsungSteps: [
      "Open the Samsung Internet menu (☰).",
      "Choose “Add page to”.",
      "Choose “Home screen” and confirm.",
    ],
    otherSteps: [
      "Open your browser menu.",
      "Look for “Install app” or “Add to Home screen”.",
      "Confirm the installation.",
    ],
    close: "Close",
  },
  de: {
    title: "App herunterladen",
    readyHint: "Zum Installieren hier tippen",
    iosHint: "Wir zeigen die Schritte für iPhone/iPad",
    browserHint: "Wir zeigen, wie Sie die App zum Startbildschirm hinzufügen",
    installedTitle: "App installiert",
    installedHint: "Öffnen Sie GOSTAYA über den Home-Bildschirm",
    helpTitle: "GOSTAYA zum Home-Bildschirm hinzufügen",
    iosSteps: [
      "Öffnen Sie in Safari das Teilen-Menü.",
      "Wählen Sie „Zum Home-Bildschirm“.",
      "Falls „Als Web-App öffnen“ angezeigt wird, lassen Sie es aktiviert.",
      "Tippen Sie auf „Hinzufügen“.",
    ],
    chromeSteps: [
      "Öffnen Sie das Browser-Menü (⋮).",
      "Wählen Sie „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
      "Bestätigen Sie mit „Installieren“ / „Hinzufügen“.",
    ],
    samsungSteps: [
      "Öffnen Sie das Menü von Samsung Internet (☰).",
      "Wählen Sie „Seite hinzufügen zu“.",
      "Wählen Sie „Startbildschirm“ und bestätigen Sie.",
    ],
    otherSteps: [
      "Öffnen Sie das Browser-Menü.",
      "Suchen Sie „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
      "Bestätigen Sie das Hinzufügen.",
    ],
    close: "Schließen",
  },
  ro: {
    title: "Descarcă aplicația",
    readyHint: "Apăsați aici pentru instalare",
    iosHint: "Vă arătăm pașii pentru iPhone/iPad",
    browserHint: "Vă arătăm cum să o adăugați pe telefon",
    installedTitle: "Aplicația este instalată",
    installedHint: "Deschideți GOSTAYA de pe ecranul principal",
    helpTitle: "Adăugați GOSTAYA pe ecranul principal",
    iosSteps: [
      "Deschideți meniul Partajare în Safari.",
      "Alegeți „Adăugați pe ecranul principal”.",
      "Dacă apare „Deschideți ca aplicație web”, păstrați opțiunea activă.",
      "Apăsați „Adăugați”.",
    ],
    chromeSteps: [
      "Deschideți meniul browserului (⋮).",
      "Alegeți „Instalați aplicația” sau „Adăugați pe ecranul principal”.",
      "Confirmați instalarea.",
    ],
    samsungSteps: [
      "Deschideți meniul Samsung Internet (☰).",
      "Alegeți „Adăugați pagina la”.",
      "Alegeți „Ecran principal” și confirmați.",
    ],
    otherSteps: [
      "Deschideți meniul browserului.",
      "Căutați opțiunea de instalare sau adăugare pe ecranul principal.",
      "Confirmați.",
    ],
    close: "Închide",
  },
  cs: {
    title: "Stáhnout aplikaci",
    readyHint: "Klepněte zde pro instalaci",
    iosHint: "Ukážeme kroky pro iPhone/iPad",
    browserHint: "Ukážeme, jak ji přidat do telefonu",
    installedTitle: "Aplikace je nainstalovaná",
    installedHint: "Otevírejte GOSTAYA z plochy",
    helpTitle: "Přidat GOSTAYA na plochu",
    iosSteps: [
      "V Safari otevřete nabídku Sdílet.",
      "Zvolte „Přidat na plochu“.",
      "Pokud se zobrazí „Otevřít jako webovou aplikaci“, ponechte zapnuté.",
      "Klepněte na „Přidat“.",
    ],
    chromeSteps: [
      "Otevřete nabídku prohlížeče (⋮).",
      "Zvolte „Nainstalovat aplikaci“ nebo „Přidat na plochu“.",
      "Potvrďte instalaci.",
    ],
    samsungSteps: [
      "Otevřete nabídku Samsung Internet (☰).",
      "Zvolte „Přidat stránku do“.",
      "Zvolte „Domovská obrazovka“ a potvrďte.",
    ],
    otherSteps: [
      "Otevřete nabídku prohlížeče.",
      "Vyhledejte instalaci aplikace nebo přidání na plochu.",
      "Potvrďte.",
    ],
    close: "Zavřít",
  },
  ru: {
    title: "Скачать приложение",
    readyHint: "Нажмите здесь для установки",
    iosHint: "Покажем шаги для iPhone/iPad",
    browserHint: "Покажем, как добавить приложение на телефон",
    installedTitle: "Приложение установлено",
    installedHint: "Открывайте GOSTAYA с экрана «Домой»",
    helpTitle: "Добавьте GOSTAYA на экран «Домой»",
    iosSteps: [
      "Откройте меню «Поделиться» в Safari.",
      "Выберите «На экран „Домой“».",
      "Если есть «Открывать как веб‑приложение», оставьте включённым.",
      "Нажмите «Добавить».",
    ],
    chromeSteps: [
      "Откройте меню браузера (⋮).",
      "Выберите «Установить приложение» или «Добавить на главный экран».",
      "Подтвердите установку.",
    ],
    samsungSteps: [
      "Откройте меню Samsung Internet (☰).",
      "Выберите «Добавить страницу в».",
      "Выберите «Главный экран» и подтвердите.",
    ],
    otherSteps: [
      "Откройте меню браузера.",
      "Найдите установку приложения или добавление на главный экран.",
      "Подтвердите.",
    ],
    close: "Закрыть",
  },
};

export default function InstallAppButton({
  label,
  lang = "bg",
}: {
  label?: string;
  lang?: string;
}) {
  const resolvedLang: UiLang =
    lang === "de" || lang === "en" || lang === "ro" || lang === "cs" || lang === "ru"
      ? lang
      : "bg";

  const copy = COPY[resolvedLang];
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window === "undefined" ? null : getGuestInstallPrompt()
  );
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" && (wasGuestAppInstalled() || isStandaloneDisplayMode())
  );
  const [helpOpen, setHelpOpen] = useState(false);

  const isIOS = useMemo(() => isAppleMobileDevice(), []);
  const browserFamily = useMemo(() => guestInstallBrowserFamily(), []);

  useEffect(() => {
    const syncPrompt = () => {
      setDeferredPrompt(getGuestInstallPrompt());
    };
    const syncInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setHelpOpen(false);
    };

    const media = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      if (isStandaloneDisplayMode()) syncInstalled();
    };

    window.addEventListener(GUEST_INSTALL_PROMPT_EVENT, syncPrompt);
    window.addEventListener(GUEST_APP_INSTALLED_EVENT, syncInstalled);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleDisplayModeChange);
    } else {
      media.addListener(handleDisplayModeChange);
    }

    syncPrompt();
    if (isStandaloneDisplayMode()) syncInstalled();

    return () => {
      window.removeEventListener(GUEST_INSTALL_PROMPT_EVENT, syncPrompt);
      window.removeEventListener(GUEST_APP_INSTALLED_EVENT, syncInstalled);
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handleDisplayModeChange);
      } else {
        media.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  const track = (eventName: string, metadata?: Record<string, unknown>) => {
    void trackHubEvent({
      eventName,
      eventCategory: "pwa_install",
      section: "install_app",
      language: resolvedLang,
      metadata: {
        browserFamily,
        isIOS,
        ...metadata,
      },
    });
  };

  const openInstructions = () => {
    setHelpOpen(true);
    track("pwa_install_instructions_shown", {
      instructionType: isIOS ? "ios" : browserFamily,
    });
  };

  const handleInstall = async () => {
    track("pwa_install_clicked", {
      mode: deferredPrompt ? "native_prompt" : "instructions",
    });

    if (!deferredPrompt) {
      openInstructions();
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      track(choice.outcome === "accepted" ? "pwa_install_accepted" : "pwa_install_dismissed", {
        platform: choice.platform || null,
      });
    } finally {
      clearGuestInstallPrompt();
      setDeferredPrompt(null);
    }
  };

  const title = installed ? copy.installedTitle : label || copy.title;
  const hint = installed
    ? copy.installedHint
    : deferredPrompt
      ? copy.readyHint
      : isIOS
        ? copy.iosHint
        : copy.browserHint;

  const steps = isIOS
    ? copy.iosSteps
    : browserFamily === "samsung"
      ? copy.samsungSteps
      : browserFamily === "chrome" || browserFamily === "edge"
        ? copy.chromeSteps
        : copy.otherSteps;

  const content = (
    <>
      <InstallDeviceIcon />
      <span className="stayhub-install-copy">
        <span className="stayhub-install-title">{title}</span>
        <span className="stayhub-install-hint">{hint}</span>
      </span>
    </>
  );

  if (installed) {
    return (
      <div className="stayhub-install-card" role="status" aria-live="polite">
        {content}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="stayhub-install-card stayhub-install-card-button"
        aria-haspopup={deferredPrompt ? undefined : "dialog"}
      >
        {content}
      </button>

      {helpOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={copy.helpTitle}
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-5 text-left text-slate-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">{copy.helpTitle}</h2>
            <ol className="mt-4 space-y-3">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-5 w-full rounded-2xl bg-[#0d8580] px-4 py-3 text-sm font-bold text-white"
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
