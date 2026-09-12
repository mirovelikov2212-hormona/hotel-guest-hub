import type { ReactNode } from "react";

export type ScannerV2ExpectedItemView = {
  id: string;
  domain: string;
  nameHint: string;
  url: string;
  urls: string[];
  basis: string;
  crawled: boolean;
};

export type ScannerV2DomainInventoryView = {
  domain: string;
  expectationState: string;
  expectedCount: number;
  expectedItems: ScannerV2ExpectedItemView[];
  issues: string[];
};

export type ScannerV2FactView = {
  category: string;
  subject?: string;
  attribute?: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
  verification?: {
    status?: string;
    independentSourceCount?: number;
    sourceUrls?: string[];
  };
};

export type ScannerV2ConflictClaimView = {
  category?: string;
  label?: string;
  value?: string;
  canonicalValue?: string;
  sourceUrls?: string[];
};

export type ScannerV2ConflictView = {
  id?: string;
  topic?: string;
  topicLabel?: string;
  subject?: string;
  attribute?: string;
  state?: string;
  claims?: ScannerV2ConflictClaimView[];
  sourceUrls?: string[];
};

export type ScannerV2CandidateView = {
  inventory: {
    domains: ScannerV2DomainInventoryView[];
  };
  facts: ScannerV2FactView[];
  conflicts: ScannerV2ConflictView[];
  validation: {
    status: string;
    downstreamHandoffAllowed: false;
    blockingReasons: string[];
  };
};

export type ScannerV2DocumentView = {
  url: string;
  status: string;
  domains: string[];
  facts?: ScannerV2FactView[];
  byteCount?: number;
  error?: string;
};

export default function HotelScannerV2Details({
  candidate,
  documents,
  lang,
}: {
  candidate?: ScannerV2CandidateView;
  documents?: ScannerV2DocumentView[];
  lang: "bg" | "en";
}) {
  if (!candidate) return null;
  const copy = lang === "bg" ? {
    title: "Review evidence",
    intro: "Пълният read-only evidence слой за приемателния тест. Това не е Approved Hotel Intelligence.",
    inventory: "Expected inventory",
    facts: "Извлечени и проверени факти",
    conflicts: "Conflict evidence",
    documents: "PDF ingestion",
    noItems: "Няма записи.",
    source: "Източник",
    sources: "Източници",
    status: "Статус",
    basis: "Основание",
    crawled: "прочетена",
    discoveredOnly: "само открита",
  } : {
    title: "Review evidence",
    intro: "Full read-only evidence layer for acceptance testing. This is not Approved Hotel Intelligence.",
    inventory: "Expected inventory",
    facts: "Extracted and verified facts",
    conflicts: "Conflict evidence",
    documents: "PDF ingestion",
    noItems: "No records.",
    source: "Source",
    sources: "Sources",
    status: "Status",
    basis: "Basis",
    crawled: "crawled",
    discoveredOnly: "discovered only",
  };

  const factsByCategory = new Map<string, ScannerV2FactView[]>();
  for (const fact of candidate.facts || []) {
    const category = fact.category || "other";
    if (!factsByCategory.has(category)) factsByCategory.set(category, []);
    factsByCategory.get(category)?.push(fact);
  }

  return (
    <section className="rounded-2xl border border-white/5 bg-black/15 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{copy.title}</h3>
      <p className="mt-2 text-xs leading-5 text-neutral-500">{copy.intro}</p>
      <div className="mt-4 space-y-3">
        <ReviewDetails title={`${copy.inventory} · ${candidate.inventory?.domains?.reduce((sum, domain) => sum + Number(domain.expectedCount || 0), 0) || 0}`} open>
          <div className="space-y-4">
            {(candidate.inventory?.domains || []).map((domain) => (
              <div key={domain.domain} className="rounded-xl border border-white/5 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-neutral-100">{domain.domain}</strong>
                  <Badge>{domain.expectationState}</Badge>
                  <span className="text-xs text-neutral-500">expected: {domain.expectedCount}</span>
                  {domain.issues?.map((issue) => <Badge key={issue} warning>{issue}</Badge>)}
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {(domain.expectedItems || []).map((item) => (
                    <div key={item.id} className="rounded-lg border border-white/5 px-3 py-2">
                      <p className="text-xs font-semibold text-neutral-200">{item.nameHint || item.id}</p>
                      <p className="mt-1 text-[11px] text-neutral-500">{copy.basis}: {item.basis} · {item.crawled ? copy.crawled : copy.discoveredOnly}</p>
                      {item.url ? <p className="mt-1 break-all font-mono text-[10px] text-neutral-600">{item.url}</p> : null}
                    </div>
                  ))}
                  {!domain.expectedItems?.length ? <p className="text-xs text-neutral-500">{copy.noItems}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </ReviewDetails>

        <ReviewDetails title={`${copy.facts} · ${candidate.facts?.length || 0}`}>
          <div className="space-y-4">
            {[...factsByCategory.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([category, facts]) => (
              <div key={category} className="rounded-xl border border-white/5 bg-black/20 p-3">
                <div className="flex items-center gap-2"><strong className="text-sm text-neutral-100">{category}</strong><span className="text-xs text-neutral-500">{facts.length}</span></div>
                <div className="mt-3 space-y-2">
                  {facts.map((fact, index) => (
                    <div key={`${category}:${fact.subject || "hotel"}:${fact.attribute || fact.label}:${index}`} className="rounded-lg border border-white/5 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-neutral-200">{fact.subject || "hotel"}</span>
                        <span className="font-mono text-[10px] text-neutral-500">{fact.attribute || fact.label}</span>
                        {fact.verification?.status ? <Badge>{fact.verification.status}</Badge> : null}
                      </div>
                      <p className="mt-1 leading-5 text-neutral-300">{fact.value}</p>
                      <SourceUrls urls={fact.sourceUrls} label={copy.sources} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!candidate.facts?.length ? <p className="text-xs text-neutral-500">{copy.noItems}</p> : null}
          </div>
        </ReviewDetails>

        <ReviewDetails title={`${copy.conflicts} · ${candidate.conflicts?.length || 0}`} open={Boolean(candidate.conflicts?.length)}>
          <div className="space-y-3">
            {(candidate.conflicts || []).map((conflict, index) => (
              <div key={conflict.id || `${conflict.subject}:${conflict.attribute}:${index}`} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-amber-100">{conflict.subject || "hotel"}</strong>
                  <span className="font-mono text-xs text-amber-100/70">{conflict.attribute || conflict.topicLabel || conflict.topic}</span>
                  <Badge warning>{conflict.state || "CONFLICT"}</Badge>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {(conflict.claims || []).map((claim, claimIndex) => (
                    <div key={`${claim.canonicalValue || claim.value}:${claimIndex}`} className="rounded-lg border border-amber-300/10 px-3 py-2">
                      <p className="text-xs leading-5 text-neutral-200">{claim.value || claim.canonicalValue}</p>
                      <SourceUrls urls={claim.sourceUrls || []} label={copy.source} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!candidate.conflicts?.length ? <p className="text-xs text-neutral-500">{copy.noItems}</p> : null}
          </div>
        </ReviewDetails>

        <ReviewDetails title={`${copy.documents} · ${documents?.length || 0}`}>
          <div className="space-y-2">
            {(documents || []).map((document) => (
              <div key={document.url} className="rounded-xl border border-white/5 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge warning={document.status !== "INGESTED"}>{document.status}</Badge>
                  <span className="text-xs text-neutral-500">facts: {document.facts?.length || 0}</span>
                  <span className="text-xs text-neutral-500">{document.domains?.join(", ")}</span>
                </div>
                <p className="mt-2 break-all font-mono text-[10px] text-neutral-500">{document.url}</p>
                {document.error ? <p className="mt-2 text-xs text-rose-200">{document.error}</p> : null}
              </div>
            ))}
            {!documents?.length ? <p className="text-xs text-neutral-500">{copy.noItems}</p> : null}
          </div>
        </ReviewDetails>
      </div>
    </section>
  );
}

function ReviewDetails({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open} className="group rounded-xl border border-white/5 bg-black/10 p-3"><summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-[0.12em] text-neutral-300">{title}</summary><div className="mt-3">{children}</div></details>;
}

function Badge({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${warning ? "border-amber-300/20 bg-amber-300/5 text-amber-100" : "border-emerald-300/20 bg-emerald-300/5 text-emerald-100"}`}>{children}</span>;
}

function SourceUrls({ urls, label }: { urls: string[]; label: string }) {
  if (!urls?.length) return null;
  return <div className="mt-2"><p className="text-[9px] uppercase tracking-[0.1em] text-neutral-600">{label}</p>{urls.slice(0, 6).map((url) => <p key={url} className="mt-1 break-all font-mono text-[10px] text-neutral-600">{url}</p>)}</div>;
}
