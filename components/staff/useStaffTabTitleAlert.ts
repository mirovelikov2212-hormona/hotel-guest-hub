"use client";

import { useCallback, useEffect, useRef } from "react";
import type { StaffRequest } from "@/lib/staff/types";

const STAFF_ALERT_TITLE = "🔴 НОВА ЗАЯВКА";
const STAFF_TITLE_BLINK_MS = 900;
const DEFAULT_STAFF_TITLE = "GuestHub Staff";
const INITIAL_ALERT_BASELINE_MS = 5000;

function getCurrentNewRequestIds(requests: StaffRequest[]) {
  return requests
    .filter((request) => request.status === "new" && !request.isTest)
    .map((request) => request.id);
}

export function useStaffTabTitleAlert(requests: StaffRequest[]) {
  const initializedRef = useRef(false);
  const seenNewIdsRef = useRef<Set<string>>(new Set());
  const latestRequestsRef = useRef(requests);
  const originalTitleRef = useRef(DEFAULT_STAFF_TITLE);
  const blinkIntervalRef = useRef<number | null>(null);
  const alertActiveRef = useRef(false);
  const showAlertTitleRef = useRef(false);

  latestRequestsRef.current = requests;

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

    const baselineTimer = window.setTimeout(() => {
      for (const id of getCurrentNewRequestIds(latestRequestsRef.current)) {
        seenNewIdsRef.current.add(id);
      }
      initializedRef.current = true;
    }, INITIAL_ALERT_BASELINE_MS);

    const stopWhenTabIsActive = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        stopAlert();
      }
    };

    document.addEventListener("visibilitychange", stopWhenTabIsActive);
    window.addEventListener("focus", stopWhenTabIsActive);

    return () => {
      window.clearTimeout(baselineTimer);
      document.removeEventListener("visibilitychange", stopWhenTabIsActive);
      window.removeEventListener("focus", stopWhenTabIsActive);
      stopAlert();
    };
  }, [stopAlert]);

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

    if (!hasFreshNewRequest) return;

    const tabIsInactive =
      document.visibilityState !== "visible" || !document.hasFocus();

    if (tabIsInactive) {
      startAlert();
    }
  }, [requests, startAlert]);
}
