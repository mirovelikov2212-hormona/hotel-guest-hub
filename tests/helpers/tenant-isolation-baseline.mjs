const SAFE_STATUSES = new Set(["scoped", "platform_scope", "identity_scope"]);

function normalizeReasons(reasons) {
  return Array.from(new Set((reasons || []).map((value) => String(value || "").trim()).filter(Boolean))).sort();
}

function tableReference(finding) {
  return String(
    finding?.table ||
    finding?.tableExpression ||
    finding?.rpc ||
    "<unknown>"
  ).trim();
}

export function makeTenantIsolationFindingKey(finding) {
  return [
    String(finding?.filePath || "").trim(),
    String(Number(finding?.line || 0)),
    tableReference(finding),
    String(finding?.operation || "unknown").trim(),
    normalizeReasons(finding?.reasons).join(","),
  ].join("|");
}

export function evaluateTenantIsolation(findings, baseline) {
  const allFindings = Array.isArray(findings) ? findings : [];
  const entries = Array.isArray(baseline?.entries) ? baseline.entries : [];

  const unknownStatuses = allFindings.filter(
    (finding) => finding?.status !== "needs_review" && !SAFE_STATUSES.has(finding?.status),
  );

  const currentReview = allFindings.filter((finding) => finding?.status === "needs_review");
  const currentByKey = new Map(currentReview.map((finding) => [makeTenantIsolationFindingKey(finding), finding]));

  const baselineKeys = entries.map(makeTenantIsolationFindingKey);
  const duplicateBaselineKeys = baselineKeys.filter((key, index) => baselineKeys.indexOf(key) !== index);
  const baselineKeySet = new Set(baselineKeys);

  const unexpected = currentReview.filter(
    (finding) => !baselineKeySet.has(makeTenantIsolationFindingKey(finding)),
  );

  const stale = entries.filter(
    (entry) => !currentByKey.has(makeTenantIsolationFindingKey(entry)),
  );

  const expectedCount = Number(baseline?.expectedNeedsReview);
  const countMismatch =
    Number.isFinite(expectedCount) && expectedCount >= 0
      ? currentReview.length !== expectedCount
      : false;

  return {
    ok:
      unexpected.length === 0 &&
      stale.length === 0 &&
      duplicateBaselineKeys.length === 0 &&
      unknownStatuses.length === 0 &&
      !countMismatch,
    total: allFindings.length,
    needsReview: currentReview.length,
    unexpected,
    stale,
    duplicateBaselineKeys,
    unknownStatuses,
    countMismatch,
  };
}
