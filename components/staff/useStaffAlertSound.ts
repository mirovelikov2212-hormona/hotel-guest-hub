"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffDepartment, StaffRequest } from "@/lib/staff/types";

const ALERT_SOUND_STORAGE_PREFIX = "stayhub_staff_alert_sound";
const DEFAULT_SOUND_SRC = "/sounds/new-request-chime.wav";

function buildSoundKey(hotelSlug: string | undefined, department: StaffDepartment) {
  return `${ALERT_SOUND_STORAGE_PREFIX}:${String(hotelSlug || "default").trim().toLowerCase()}:${department}`;
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
  const storageKey = useMemo(() => buildSoundKey(hotelSlug, department), [hotelSlug, department]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [freshRequestSequence, setFreshRequestSequence] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const initializedRef = useRef(false);
  const seenNewIdsRef = useRef<Set<string>>(new Set());

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
    };
  }, [src, storageKey]);

  const playTone = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      audioUnlockedRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  const unlockAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;
    if (audioUnlockedRef.current) return true;

    const previousMuted = audio.muted;
    const previousVolume = audio.volume;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = true;
      audio.volume = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = previousMuted;
      audio.volume = previousVolume;
      audioUnlockedRef.current = true;
      return true;
    } catch {
      audio.muted = previousMuted;
      audio.volume = previousVolume;
      return false;
    }
  }, []);

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
      await playTone();
    }
  }, [playTone, soundEnabled, storageKey]);

  useEffect(() => {
    const currentNewIds = new Set(
      requests.filter((request) => request.status === "new").map((request) => request.id)
    );

    if (!initializedRef.current) {
      seenNewIdsRef.current = currentNewIds;
      initializedRef.current = true;
      return;
    }

    const hasFreshNewRequest = [...currentNewIds].some(
      (id) => !seenNewIdsRef.current.has(id)
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
