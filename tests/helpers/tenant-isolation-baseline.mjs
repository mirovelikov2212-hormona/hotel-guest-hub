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

function findReviewedEntryMatches(entries, descriptor) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      entry.filePath === descriptor.filePath &&
      Number(entry.line) === Number(descriptor.line ?? descriptor.fromLine) &&
      (!descriptor.table || entry.table === descriptor.table) &&
      (!descriptor.operation || entry.operation === descriptor.operation),
    );
}

/**
 * Apply one explicit reviewed-baseline delta while preserving the provenance of
 * already-audited findings. Relocations may move a finding across files as well
 * as lines; this records source refactors without pretending an old query is a
 * newly reviewed authority.
 */
export function applyTenantIsolationReviewedDelta(base, delta) {
  if (!delta) return base;
  if (delta.baseCheckpoint !== base.checkpoint) {
    throw new Error(
      `Tenant isolation delta expects base checkpoint ${delta.baseCheckpoint}, got ${base.checkpoint}.`,
    );
  }

  const entries = base.entries.map((entry) => ({ ...entry }));

  for (const removal of delta.removals || []) {
    const matches = findReviewedEntryMatches(entries, removal);
    if (matches.length !== 1) {
      throw new Error(
        `Tenant isolation removal must match exactly one reviewed entry: ${removal.filePath}:${removal.line}.`,
      );
    }
    entries.splice(matches[0].index, 1);
  }

  for (const relocation of delta.relocations || []) {
    const matches = findReviewedEntryMatches(entries, relocation);
    if (matches.length !== 1) {
      throw new Error(
        `Tenant isolation relocation must match exactly one reviewed entry: ${relocation.filePath}:${relocation.fromLine}.`,
      );
    }

    entries[matches[0].index] = {
      ...matches[0].entry,
      filePath: String(relocation.toFilePath || matches[0].entry.filePath),
      line: Number(relocation.toLine),
    };
  }

  for (const addition of delta.additions || []) entries.push({ ...addition });

  return {
    ...base,
    checkpoint: delta.checkpoint,
    expectedNeedsReview: Number(delta.expectedNeedsReview),
    entries,
  };
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
