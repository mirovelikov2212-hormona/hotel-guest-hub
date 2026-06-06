"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffDepartment, StaffRequest } from "@/lib/staff/types";

const ALERT_SOUND_STORAGE_PREFIX = "stayhub_staff_alert_sound";
const DEFAULT_SOUND_SRC = "/sounds/new-request-chime.wav";

function buildSoundKey(
  hotelSlug: string | undefined,
  department: StaffDepartment,
) {
  return `${ALERT_SOUND_STORAGE_PREFIX}:${String(hotelSlug || "default")
    .trim()
    .toLowerCase()}:${department}`;
}

function playWebAudioChime(context: AudioContext) {
  const tones = [
    { frequency: 880, startOffset: 0, duration: 0.16 },
    { frequency: 1175, startOffset: 0.18, duration: 0.24 },
  ];
  const now = context.currentTime + 0.02;

  tones.forEach(({ frequency, startOffset, duration }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + startOffset;
    const stopAt = startAt + duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.02);
  });
}

export function useStaffAlertSound({
  hotelSlug,
  department,
  requests,
  src = DEFAULT_SOUND_SRC,
}: {
  hotelSlug?: string;
  department: StaffDepartment;
  requests: StaffRequest[];
  src?: string;
}) {
  const storageKey = useMemo(
    () => buildSoundKey(hotelSlug, department),
    [hotelSlug, department],
  );
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [freshRequestSequence, setFreshRequestSequence] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const initializedRef = useRef(false);
  const seenNewIdsRef = useRef<Set<string>>(new Set());

  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (audioContextRef.current) return audioContextRef.current;

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextConstructor) return null;

    const context = new AudioContextConstructor();
    audioContextRef.current = context;
    return context;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    audioRef.current = new Audio(src);
    audioRef.current.preload = "auto";
    audioRef.current.load();
    audioUnlockedRef.current = false;

    const stored = window.localStorage.getItem(storageKey);
    setSoundEnabled(stored === "on");
    setReady(true);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const context = audioContextRef.current;
      audioContextRef.current = null;
      audioUnlockedRef.current = false;

      if (context && context.state !== "closed") {
        void context.close();
      }
    };
  }, [src, storageKey]);

  const unlockAudio = useCallback(async () => {
    const context = getAudioContext();
    if (!context) return false;
    if (audioUnlockedRef.current && context.state === "running") return true;

    try {
      if (context.state !== "running") {
        await context.resume();
      }

      const unlocked = context.state === "running";
      audioUnlockedRef.current = unlocked;
      return unlocked;
    } catch {
      return false;
    }
  }, [getAudioContext]);

  const playTone = useCallback(async () => {
    const context = getAudioContext();

    if (context) {
      try {
        if (context.state !== "running") {
          await context.resume();
        }

        if (context.state === "running") {
          playWebAudioChime(context);
          audioUnlockedRef.current = true;
          return true;
        }
      } catch {
        // Fall back to the audio file below.
      }
    }

    const audio = audioRef.current;
    if (!audio) return false;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }, [getAudioContext]);

  useEffect(() => {
    if (typeof window === "undefined" || !soundEnabled || !ready) return;
    if (audioUnlockedRef.current) return;

    const tryUnlock = () => {
      void unlockAudio();
    };

    window.addEventListener("pointerdown", tryUnlock, true);
    window.addEventListener("keydown", tryUnlock, true);
    window.addEventListener("touchstart", tryUnlock, true);

    return () => {
      window.removeEventListener("pointerdown", tryUnlock, true);
      window.removeEventListener("keydown", tryUnlock, true);
      window.removeEventListener("touchstart", tryUnlock, true);
    };
  }, [ready, soundEnabled, unlockAudio]);

  const toggleSound = useCallback(async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "on" : "off");
    }

    if (next) {
      await unlockAudio();
      await playTone();
    }
  }, [playTone, soundEnabled, storageKey, unlockAudio]);

  useEffect(() => {
    const currentNewIds = new Set(
      requests
        .filter((request) => request.status === "new")
        .map((request) => request.id),
    );

    if (!initializedRef.current) {
      seenNewIdsRef.current = currentNewIds;
      initializedRef.current = true;
      return;
    }

    const hasFreshNewRequest = [...currentNewIds].some(
      (id) => !seenNewIdsRef.current.has(id),
    );

    seenNewIdsRef.current = currentNewIds;

    if (!hasFreshNewRequest) return;

    setFreshRequestSequence((value) => value + 1);

    if (soundEnabled) {
      void playTone();
    }
  }, [playTone, requests, soundEnabled]);

  return {
    ready,
    soundEnabled,
    toggleSound,
    freshRequestSequence,
  };
}
