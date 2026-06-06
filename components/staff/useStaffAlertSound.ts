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
  const initializedRef = useRef(false);
  const seenNewIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 1;
    audio.load();
    audioRef.current = audio;

    const stored = window.localStorage.getItem(storageKey);
    setSoundEnabled(stored === "on");
    setReady(true);

    return () => {
      audio.pause();
      audioRef.current = null;
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
      return true;
    } catch (error) {
      console.warn("Reception alert sound could not play", error);
      return false;
    }
  }, []);

  const toggleSound = useCallback(async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "on" : "off");
    }

    if (next) {
      // This explicit click unlocks later background playback in the browser.
      await playTone();
    }
  }, [playTone, soundEnabled, storageKey]);

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
