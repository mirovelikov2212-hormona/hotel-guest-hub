"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import ManagerModuleDialog, { type ManagerModule } from "./ManagerModuleDialog";
import "./manager-experience.css";

type Lang = "bg" | "en" | "de";
type Scene = "welcome" | "door" | "opening" | "bell" | "ringing" | "hub";
const ASSETS = "/marketing/manager";
const INTRO_EVENT = "gostaya-manager-intro";
const COPY = {
  bg: { title: "Мениджърски панел", welcome: "Какво ще управляваме днес?", door: "Докоснете ключа, за да отворите", bell: "Натиснете звънеца", skip: "Пропусни интрото", replay: "Повтори интрото", sound: "Звук", back: "Към модулите", previous: "Предишен модул", next: "Следващ модул", close: "Затвори" },
  en: { title: "Manager panel", welcome: "What will we manage today?", door: "Tap the key to open", bell: "Ring the bell", skip: "Skip intro", replay: "Replay intro", sound: "Sound", back: "Back to modules", previous: "Previous module", next: "Next module", close: "Close" },
  de: { title: "Manager-Bereich", welcome: "Was verwalten wir heute?", door: "Zum Öffnen den Schlüssel antippen", bell: "Klingel betätigen", skip: "Intro überspringen", replay: "Intro wiederholen", sound: "Ton", back: "Zu den Modulen", previous: "Vorheriges Modul", next: "Nächstes Modul", close: "Schließen" },
};

function subscribeIntro(callback: () => void) {
  window.addEventListener(INTRO_EVENT, callback);
  return () => window.removeEventListener(INTRO_EVENT, callback);
}
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Presentation only: module contents retain their existing APIs, permissions and state. */
export default function ManagerExperience({ hotelSlug, hotelName, lang, modules, toolbar, initialModule }: {
  hotelSlug: string;
  hotelName: string;
  lang: Lang;
  modules: ManagerModule[];
  toolbar?: ReactNode;
  initialModule?: string;
}) {
  const copy = COPY[lang];
  const storageKey = `gostaya:manager-intro:v1:${hotelSlug}`;
  const introSeen = useSyncExternalStore(subscribeIntro, () => {
    try { return sessionStorage.getItem(storageKey) === "seen"; } catch { return false; }
  }, () => false);
  const reducedMotion = useSyncExternalStore(subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const [scene, setScene] = useState<Scene>(initialModule ? "hub" : "welcome");
  const [activeModule, setActiveModule] = useState<string | undefined>(initialModule);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const sounds = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentScene = scene === "welcome" ? (introSeen ? "hub" : "door") : scene;
  const activeIndex = modules.findIndex((module) => module.id === activeModule);

  const finishIntro = useCallback(() => {
    setScene("hub");
    try { sessionStorage.setItem(storageKey, "seen"); } catch { /* Storage is optional. */ }
    window.dispatchEvent(new Event(INTRO_EVENT));
  }, [storageKey]);

  // A single timer per transition. Skip/replay/unmount cancels pending transitions.
  useEffect(() => {
    if (scene !== "opening" && scene !== "ringing") return;
    const timer = window.setTimeout(() => {
      if (scene === "opening") setScene("bell");
      else finishIntro();
    }, reducedMotion ? 100 : scene === "opening" ? 1600 : 1000);
    return () => window.clearTimeout(timer);
  }, [scene, reducedMotion, finishIntro]);

  useEffect(() => () => {
    const activeSounds = sounds.current;
    activeSounds.forEach((sound) => sound.pause());
    activeSounds.clear();
  }, []);

  function playSound(name: "unlock" | "bell" | "tick") {
    if (!soundEnabled) return;
    let sound = sounds.current.get(name);
    if (!sound) {
      sound = new Audio(`${ASSETS}/sfx/${name}.mp3`);
      sounds.current.set(name, sound);
    }
    sound.volume = name === "tick" ? 0.25 : 0.7;
    sound.currentTime = 0;
    // Called directly by a click so playback also works on mobile browsers.
    void sound.play().catch(() => {});
  }

  function selectModule(id: string) { playSound("tick"); setActiveModule(id); }
  function moveModule(direction: number) {
    const next = modules[(activeIndex + direction + modules.length) % modules.length];
    if (next) selectModule(next.id);
  }

  return (
    <main className="manager-experience" data-scene={currentScene}>
      <header className="manager-experience-topbar">
        <a href={`/${lang}`} className="manager-experience-wordmark">GOSTAYA</a>
        <div className="manager-experience-hotel"><strong>{copy.title}</strong><span>{hotelName}</span></div>
        <div className="manager-experience-controls">
          <button type="button" className="manager-scene-control" aria-label={copy.sound} title={copy.sound} aria-pressed={soundEnabled} onClick={() => {
            if (soundEnabled) sounds.current.forEach((sound) => sound.pause());
            setSoundEnabled((enabled) => !enabled);
          }}><span className="manager-sound-label">{copy.sound} </span>{soundEnabled ? "◖))" : "×"}</button>
          {currentScene === "hub" ? <button type="button" className="manager-scene-control" onClick={() => { setActiveModule(undefined); setScene("door"); }}>{copy.replay}</button> :
            <button type="button" className="manager-scene-control" onClick={finishIntro}>{copy.skip}</button>}
          {toolbar}
        </div>
      </header>

      {currentScene === "door" || currentScene === "opening" ? <section className="manager-intro-scene" aria-label={copy.door}>
        <picture><source media="(max-width: 700px)" srcSet={`${ASSETS}/intro/door-closed-m.webp`} /><img src={`${ASSETS}/intro/door-closed.webp`} alt="" /></picture>
        <picture className="manager-intro-open"><source media="(max-width: 700px)" srcSet={`${ASSETS}/intro/door-open-m.webp`} /><img src={`${ASSETS}/intro/door-open.webp`} alt="" /></picture>
        <button type="button" className="manager-door-key manager-scene-control" aria-label={copy.door} disabled={currentScene === "opening"}
          onClick={() => { playSound("unlock"); setScene("opening"); }}><span aria-hidden="true" /></button>
        <p className="manager-intro-caption">{copy.door}</p>
      </section> : currentScene === "bell" || currentScene === "ringing" ? <section className="manager-intro-scene" aria-label={copy.bell}>
        <picture><source media="(max-width: 700px)" srcSet={`${ASSETS}/intro/bell-idle-m.webp`} /><img src={`${ASSETS}/intro/bell-idle.webp`} alt="" /></picture>
        <picture className="manager-intro-press"><source media="(max-width: 700px)" srcSet={`${ASSETS}/intro/bell-palm-m.webp`} /><img src={`${ASSETS}/intro/bell-palm.webp`} alt="" /></picture>
        <button type="button" className="manager-bell-button manager-scene-control" aria-label={copy.bell} disabled={currentScene === "ringing"}
          onClick={() => { playSound("bell"); setScene("ringing"); }} />
        <p className="manager-intro-caption">{copy.bell}</p>
      </section> : <section className="manager-lobby" aria-label={copy.title}>
        <Image src={`${ASSETS}/intro/hub.webp`} alt="" fill sizes="100vw" className="manager-lobby-image" />
        <h1>{copy.welcome}</h1>
        <button type="button" className="manager-lobby-bell manager-scene-control" aria-label={copy.bell} onClick={() => playSound("bell")} />
        <nav className="manager-lobby-modules" aria-label={copy.title}>
          <svg className="manager-lobby-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {modules.map((module, index) => {
              const angle = -Math.PI / 2 + index * Math.PI * 2 / modules.length;
              return <line key={module.id} x1={50 + Math.cos(angle) * 10} y1={50 + Math.sin(angle) * 10}
                x2={50 + Math.cos(angle) * 38} y2={50 + Math.sin(angle) * 35} />;
            })}
          </svg>
          {modules.map((module, index) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / modules.length;
            const style = { "--module-x": `${Math.cos(angle) * 38}%`, "--module-y": `${Math.sin(angle) * 35}%`, "--module-order": index } as CSSProperties;
            return <button key={module.id} type="button" className="manager-lobby-module manager-scene-control" style={style} onClick={() => selectModule(module.id)}>
              <Image src={`${ASSETS}/emoji/${module.icon}.webp`} alt="" width={56} height={56} />
              <strong>{module.label}</strong>
              {module.badge !== undefined ? <span className="manager-module-badge">{module.badge}</span> : null}
            </button>;
          })}
        </nav>
      </section>}

      <p className="manager-sound-credits"><a href="https://commons.wikimedia.org/wiki/File:Tight_door_lock_(Gravity_Sound).wav" target="_blank" rel="noreferrer">Gravity Sound · CC BY 4.0</a> · <a href="https://picturetosound.com" target="_blank" rel="noreferrer">picturetosound.com</a></p>
      <ManagerModuleDialog module={modules[activeIndex]} onClose={() => setActiveModule(undefined)}
        onPrevious={() => moveModule(-1)} onNext={() => moveModule(1)} labels={copy} />
    </main>
  );
}
