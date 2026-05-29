const fs = require('fs');
const path = require('path');

const root = process.cwd();
const rel = 'components/GuestHub.tsx';
const file = path.join(root, rel);
if (!fs.existsSync(file)) throw new Error(`${rel} not found. Run this from project root.`);
let s = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  if (!s.includes(search)) {
    console.warn(`WARN: block not found, skipping: ${label}`);
    return false;
  }
  s = s.replace(search, replacement);
  return true;
}

// 1) Pass request-def quick action helpers from GuestHub to Accordion.
const oldAccordionCall = `                aiIntroText={aiIntroText}
                submittingRequest={submittingRequest}
                onCloseAi={clearAiState}
              />`;
const newAccordionCall = `                aiIntroText={aiIntroText}
                submittingRequest={submittingRequest}
                lang={lang}
                handleRequestDefClick={handleRequestDefClick}
                getRequestDefTitle={getRequestDefTitle}
                getRequestDefMessage={getRequestDefMessage}
                getRequestDefOptions={getRequestDefOptions}
                getRequestDefPriceHint={getRequestDefPriceHint}
                getQuantityChoices={getQuantityChoices}
                getQuantityButtonLabel={getQuantityButtonLabel}
                submitRequestDefQuantityChoice={submitRequestDefQuantityChoice}
                submitRequestDefSelectionOption={submitRequestDefSelectionOption}
                onCloseAi={clearAiState}
              />`;
if (!s.includes('getQuantityButtonLabel={getQuantityButtonLabel}')) {
  replaceOnce(oldAccordionCall, newAccordionCall, 'Accordion call props');
}

// 2) Add props in Accordion parameter destructuring.
const oldDestructure = `  aiIntroText,
  submittingRequest,
  onCloseAi,
}: {`;
const newDestructure = `  aiIntroText,
  submittingRequest,
  lang,
  handleRequestDefClick,
  getRequestDefTitle,
  getRequestDefMessage,
  getRequestDefOptions,
  getRequestDefPriceHint,
  getQuantityChoices,
  getQuantityButtonLabel,
  submitRequestDefQuantityChoice,
  submitRequestDefSelectionOption,
  onCloseAi,
}: {`;
if (!s.includes('handleRequestDefClick,\n  getRequestDefTitle,')) {
  replaceOnce(oldDestructure, newDestructure, 'Accordion destructuring props');
}

// 3) Add types for the new Accordion props.
const oldTypeProps = `  aiIntroText: string;
  submittingRequest: boolean;
  onCloseAi?: () => void;
}) {`;
const newTypeProps = `  aiIntroText: string;
  submittingRequest: boolean;
  lang: LangKey;
  handleRequestDefClick: (def: RequestDef) => void;
  getRequestDefTitle: (def?: RequestDef | null) => string;
  getRequestDefMessage: (def?: RequestDef | null) => string;
  getRequestDefOptions: (def?: RequestDef | null, preferredLang?: LangKey) => string[];
  getRequestDefPriceHint: (def: RequestDef) => string;
  getQuantityChoices: (def: RequestDef) => number[];
  getQuantityButtonLabel: (def: RequestDef, qty: number) => string;
  submitRequestDefQuantityChoice: (def: RequestDef, qty: number) => void;
  submitRequestDefSelectionOption: (def: RequestDef, option: string, optionIndex: number) => void;
  onCloseAi?: () => void;
}) {`;
if (!s.includes('submitRequestDefSelectionOption: (def: RequestDef, option: string, optionIndex: number) => void;')) {
  replaceOnce(oldTypeProps, newTypeProps, 'Accordion prop types');
}

// 4) Repair the title line in the request_def rendering block if it was manually changed.
s = s.replace(
  /const title = String\(\s*it\.label \|\|\s*\(def as \{ title\?: string; label\?: string \}\)\.title \|\|\s*\(def as \{ titleBg\?: string \}\)\.titleBg \|\|\s*def\.id\.replace\(\/_\/g, " "\)\s*\);/g,
  'const title = getRequestDefTitle(def) || String(requestDefItem.label || def.id.replace(/_/g, " "));'
);

s = s.replace(
  /const title = getRequestDefTitle\(def\) \|\| String\(it\.label \|\| def\.id\.replace\(\/_\/g, " "\)\);/g,
  'const title = getRequestDefTitle(def) || String(requestDefItem.label || def.id.replace(/_/g, " "));'
);

// 5) Add missing helpers if the previous patch inserted the renderer but failed to insert helper block.
if (s.includes('requestDefItem.kind === "request_def"') && !s.includes('function getRequestDefPriceHint(def: RequestDef)')) {
  const helperBlock = `
  function parseMoneyValue(value?: string | null): number | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(/(\\d+(?:[,.]\\d{1,2})?)/);
    if (!match) return null;
    const parsed = Number(match[1].replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatMoneyValue(value: number, currency?: string | null): string {
    const amount = value.toFixed(2).replace(".", ",");
    return [amount, String(currency || "€").trim()].filter(Boolean).join(" ");
  }

  function extractPriceFromText(value?: string | null): { price: string; currency: string } | null {
    const raw = String(value || "").trim();
    const match = raw.match(/(\\d+(?:[,.]\\d{2})?)\\s*(€|EUR)?/i);
    if (!match) return null;
    return {
      price: match[1].replace(".", ","),
      currency: match[2] || (raw.includes("€") ? "€" : ""),
    };
  }

  function getQtyUnitLabel() {
    if (lang === "bg") return "бр.";
    if (lang === "de") return "Stk.";
    if (lang === "ro") return "buc.";
    if (lang === "cs") return "ks";
    return "pcs";
  }

  function getRequestDefPriceHint(def: RequestDef) {
    const price = String(def.price || "").trim();
    const currency = String(def.currency || "").trim();
    if (!price) return "";

    const suffix = def.requestKind === "quantity" || def.requiresQuantity
      ? (lang === "bg" ? " / бр." : lang === "de" ? " / Stk." : lang === "ro" ? " / buc." : lang === "cs" ? " / ks" : " each")
      : "";

    return [price, currency].filter(Boolean).join(" ") + suffix;
  }

  function getQuantityChoices(def: RequestDef) {
    const min = Math.max(1, Number(def.minQty ?? 1));
    const max = Math.max(min, Number(def.maxQty ?? 10));
    const cappedMax = Math.min(max, 20);
    return Array.from({ length: cappedMax - min + 1 }, (_, index) => min + index);
  }

  function getQuantityButtonLabel(def: RequestDef, qty: number) {
    const unitPrice = parseMoneyValue(def.price);
    const currency = String(def.currency || "€").trim();
    const base = \`\${qty} \${getQtyUnitLabel()}\`;
    if (!unitPrice) return base;
    return \`\${base} — \${formatMoneyValue(unitPrice * qty, currency)}\`;
  }

  function submitRequestDefSelectionOption(def: RequestDef, option: string, optionIndex: number) {
    if (!ensureConfirmedRoom()) return;

    const title = getRequestDefTitle(def) || def.id.replace(/_/g, " ");
    const bgOptions = getRequestDefOptions(def, "bg");
    const bgSelected = optionIndex >= 0 ? String(bgOptions[optionIndex] || "").trim() : "";
    const optionLabel = String(tUI("label_option") || "Option");
    const noteParts = [\`\${optionLabel}: \${option}\`];

    if (bgSelected && bgSelected !== option) {
      noteParts.push(\`Оперативно BG: \${bgSelected}\`);
    }

    const extractedPrice = extractPriceFromText(option) || extractPriceFromText(bgSelected);
    const requestPrice = String(def.price || extractedPrice?.price || "").trim();
    const requestCurrency = String(def.currency || extractedPrice?.currency || "").trim();

    submitGuestRequest({
      type: String(def.requestType || def.id),
      typeLabel: title,
      note: noteParts.join("\\n"),
      departmentOverride: getRequestDefDepartmentOverride(def),
      notifyDepartments: def.notifyDepartments,
      requiresBilling: def.requiresBilling,
      price: requestPrice,
      currency: requestCurrency,
      sourceRequestDef: def.id,
    });
  }

  function submitRequestDefQuantityChoice(def: RequestDef, qty: number) {
    if (!ensureConfirmedRoom()) return;

    const title = getRequestDefTitle(def) || def.id.replace(/_/g, " ");
    const unitPrice = parseMoneyValue(def.price);
    const currency = String(def.currency || "€").trim();
    const total = unitPrice ? unitPrice * qty : null;
    const quantityLabel = String(tUI("label_quantity") || tUI("label_people") || "Quantity");
    const noteParts = [\`\${quantityLabel}: \${qty}\`];

    if (total !== null) {
      noteParts.push(\`Обща цена: \${formatMoneyValue(total, currency)}\`);
    }

    submitGuestRequest({
      type: String(def.requestType || def.id),
      typeLabel: title,
      note: noteParts.join("\\n"),
      departmentOverride: getRequestDefDepartmentOverride(def),
      notifyDepartments: def.notifyDepartments,
      requiresBilling: def.requiresBilling,
      price: total !== null ? total.toFixed(2).replace(".", ",") : def.price,
      currency,
      sourceRequestDef: def.id,
    });
  }
`;
  const anchor = '  function askBrokenItemDescription() {';
  replaceOnce(anchor, helperBlock + '\n' + anchor, 'insert missing paid service helpers');
}

fs.writeFileSync(file, s, 'utf8');
console.log(`Patched ${rel}. Now run: npm run build`);
