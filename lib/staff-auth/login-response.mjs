const SAFE_FALLBACK_MESSAGE =
  "PIN login is temporarily unavailable. Reload the page and try again.";

function cleanText(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "undefined" || text.toLowerCase() === "null") {
    return "";
  }
  return text;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
}

export function getStaffLoginErrorMessage(status, payload) {
  const responseStatus = Number(status);
  const body = payload && typeof payload === "object" ? payload : {};
  const code = cleanText(body.code);
  const serverMessage = cleanText(body.error);

  if (code === "INVALID_PIN" || responseStatus === 401) {
    return "Invalid PIN. Check the code and try again.";
  }

  if (code === "STAFF_LOGIN_LOCKED" || responseStatus === 429) {
    const retryAfterSeconds = positiveInteger(body.retryAfterSeconds);
    if (retryAfterSeconds > 0) {
      const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return `Too many failed attempts. Try again in about ${retryAfterMinutes} minute${
        retryAfterMinutes === 1 ? "" : "s"
      }.`;
    }
    return "Too many failed attempts. Try again later.";
  }

  if (code === "STAFF_ORIGIN_FORBIDDEN") {
    return "This login request was blocked. Reload the page and try again.";
  }

  if (
    code === "STAFF_LOGIN_THROTTLE_UNAVAILABLE" ||
    responseStatus === 502 ||
    responseStatus === 503 ||
    responseStatus === 504
  ) {
    return SAFE_FALLBACK_MESSAGE;
  }

  return serverMessage || SAFE_FALLBACK_MESSAGE;
}

export function getStaffLoginNetworkErrorMessage() {
  return "PIN login could not reach the server. Check the connection and try again.";
}
