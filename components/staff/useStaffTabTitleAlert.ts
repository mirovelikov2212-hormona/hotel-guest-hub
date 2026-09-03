"use client";

import { useCallback, useEffect, useRef } from "react";

const STAFF_ALERT_TITLE = "🔴 НОВА ЗАЯВКА";
const STAFF_TITLE_BLINK_MS = 900;
const DEFAULT_STAFF_TITLE = "GuestHub Staff";
const INITIAL_ALERT_BASELINE_MS = 5000;

type AlertableStaffRequest = {
  id: string;
  status: string;
  isTest?: boolean | null;
};

function getCurrentNewRequestIds(requests: AlertableStaffRequest[]) {
  return requests
    .filter((request) => request.status === "new" && !request.isTest)
    .map((request) => request.id);
}

export function useStaffTabTitleAlert(
  requests: AlertableStaffRequest[],
  alertTitle = STAFF_ALERT_TITLE,
) {
  const initializedRef = useRef(false);
  const seenNewIdsRef = useRef<Set<string>>(new Set());
  const latestRequestsRef = useRef(requests);
  const originalTitleRef = useRef(DEFAULT_STAFF_TITLE);
  const activeAlertTitleRef = useRef(alertTitle);
  const blinkIntervalRef = useRef<number | null>(null);
  const alertActiveRef = useRef(false);
  const showAlertTitleRef = useRef(false);

  useEffect(() => {
    latestRequestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    activeAlertTitleRef.current = alertTitle;
  }, [alertTitle]);

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

  const startAlert = useCallback((title: string) => {
    activeAlertTitleRef.current = title;

    if (alertActiveRef.current) {
      showAlertTitleRef.current = true;
      document.title = activeAlertTitleRef.current;
      return;
    }

    alertActiveRef.current = true;
    showAlertTitleRef.current = true;
    document.title = activeAlertTitleRef.current;

    blinkIntervalRef.current = window.setInterval(() => {
      showAlertTitleRef.current = !showAlertTitleRef.current;
      document.title = showAlertTitleRef.current
        ? activeAlertTitleRef.current
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
      startAlert(alertTitle);
    }
  }, [alertTitle, requests, startAlert]);
}
