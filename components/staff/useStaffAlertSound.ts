"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffDepartment, StaffRequest } from "@/lib/staff/types";

const ALERT_SOUND_STORAGE_PREFIX = "stayhub_staff_alert_sound";
const DEFAULT_SOUND_SRC = "/sounds/new-request-chime.wav";
const INITIAL_ALERT_BASELINE_MS = 5000;

type StaffAlertScope = StaffDepartment | "manager";
type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function buildSoundKey(hotelSlug: string | undefined, department: StaffAlertScope) {
  return `${ALERT_SOUND_STORAGE_PREFIX}:${String(hotelSlug || "default").trim().toLowerCase()}:${department}`;
}

function getCurrentNewRequestIds(requests: StaffRequest[]) {
  return requests
    .filter((request) => request.status === "new" && !request.isTest)
    .map((request) => request.id);
}

export function useStaffAlertSound({
  hotelSlug,
  department,
  requests,
  src = DEFAULT_SOUND_SRC,
}: {
  hotelSlug?: string;
  department: StaffAlertScope;
  requests: StaffRequest[];
  src?: string;
}) {
  const storageKey = useMemo(
    () => buildSoundKey(hotelSlug, department),
    [hotelSlug, department],
  );
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const initializedRef = useRef(false);
  const seenNewIdsRef = useRef<Set<string>>(new Set());
  const latestRequestsRef = useRef(requests);

  latestRequestsRef.current = requests;

  const ensureAudioContextRunning = useCallback(async () => {
    if (typeof window === "undefined") return false;

    const AudioContextCtor =
      window.AudioContext ||
      (window as WebkitAudioWindow).webkitAudioContext;

    if (!AudioContextCtor) return false;

    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContextCtor();
    }

    const context = audioContextRef.current;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }

    return context.state === "running";
  }, []);

  const playFallbackTone = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return false;

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    initializedRef.current = false;
    seenNewIdsRef.current = new Set();

    audioRef.current = new Audio(src);
    audioRef.current.preload = "auto";

    const stored = window.localStorage.getItem(storageKey);
    setSoundEnabled(stored === "on");
    setReady(true);

    const baselineTimer = window.setTimeout(() => {
      for (const id of getCurrentNewRequestIds(latestRequestsRef.current)) {
        seenNewIdsRef.current.add(id);
      }
      initializedRef.current = true;
    }, INITIAL_ALERT_BASELINE_MS);

    return () => {
      window.clearTimeout(baselineTimer);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    };
  }, [src, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !soundEnabled) return;

    const unlockAudio = () => {
      void ensureAudioContextRunning();
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [ensureAudioContextRunning, soundEnabled]);

  const playTone = useCallback(async () => {
    const audio = audioRef.current;

    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        await audio.play();
        return true;
      } catch {
        // Browser autoplay policies can reject playback until a user gesture.
      }
    }

    const audioContextReady = await ensureAudioContextRunning();
    return audioContextReady ? playFallbackTone() : false;
  }, [ensureAudioContextRunning, playFallbackTone]);

  const toggleSound = useCallback(async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "on" : "off");
    }

    if (next) {
      await ensureAudioContextRunning();
      await playTone();
    }
  }, [ensureAudioContextRunning, playTone, soundEnabled, storageKey]);

  useEffect(() => {
    const currentNewIds = getCurrentNewRequestIds(requests);

    if (!initializedRef.current) {
      for (const id of currentNewIds) {
        seenNewIdsRef.current.add(id);
      }
      return;
    }

    let hasFreshNewRequest = false;
    for (const id of currentNewIds) {
      if (!seenNewIdsRef.current.has(id)) {
        hasFreshNewRequest = true;
        seenNewIdsRef.current.add(id);
      }
    }

    if (!soundEnabled || !hasFreshNewRequest) return;

    void playTone();
  }, [playTone, requests, soundEnabled]);

  return {
    ready,
    soundEnabled,
    toggleSound,
  };
}
