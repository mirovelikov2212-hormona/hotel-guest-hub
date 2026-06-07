"use client";

import { useCallback, useEffect, useRef } from "react";
import type { StaffRequest } from "@/lib/staff/types";

const STAFF_ALERT_TITLE = "🔴 НОВА ЗАЯВКА";
const STAFF_TITLE_BLINK_MS = 900;
const DEFAULT_STAFF_TITLE = "GuestHub Staff";

export function useStaffTabTitleAlert(requests: StaffRequest[]) {
  const initializedRef = useRef(false);
  const seenNewIdsRef = useRef<Set<string>>(new Set());
  const originalTitleRef = useRef(DEFAULT_STAFF_TITLE);
  const blinkIntervalRef = useRef<number | null>(null);
  const alertActiveRef = useRef(false);
  const showAlertTitleRef = useRef(false);

  const clearBlinkInterval = useCallback(() => {
    if (blinkIntervalRef.current !== null) {
      window.clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }
  }, []);

  const stopAlert = useCallback(() => {
    clearBlinkInterval();
    alertActiveRef.current = false;
    showAlertTitleRef.current = false;
    document.title = originalTitleRef.current;
  }, [clearBlinkInterval]);

  const startAlert = useCallback(() => {
    if (alertActiveRef.current) return;

    alertActiveRef.current = true;
    showAlertTitleRef.current = true;
    document.title = STAFF_ALERT_TITLE;

    blinkIntervalRef.current = window.setInterval(() => {
      showAlertTitleRef.current = !showAlertTitleRef.current;
      document.title = showAlertTitleRef.current
        ? STAFF_ALERT_TITLE
        : originalTitleRef.current;
    }, STAFF_TITLE_BLINK_MS);
  }, []);

  useEffect(() => {
    originalTitleRef.current = document.title || DEFAULT_STAFF_TITLE;

    const stopWhenTabIsActive = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        stopAlert();
      }
    };

    document.addEventListener("visibilitychange", stopWhenTabIsActive);
    window.addEventListener("focus", stopWhenTabIsActive);

    return () => {
      document.removeEventListener("visibilitychange", stopWhenTabIsActive);
      window.removeEventListener("focus", stopWhenTabIsActive);
      stopAlert();
    };
  }, [stopAlert]);

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

    const tabIsInactive =
      document.visibilityState !== "visible" || !document.hasFocus();

    if (tabIsInactive) {
      startAlert();
    }
  }, [requests, startAlert]);
}
