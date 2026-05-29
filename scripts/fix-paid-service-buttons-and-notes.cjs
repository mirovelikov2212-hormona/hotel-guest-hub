const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, 'utf8');
}

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Could not find block: ${label}`);
  }
  return content.replace(search, replacement);
}

function patchOpsCopy() {
  const rel = 'lib/staff/ops-request-copy.ts';
  let s = read(rel);

  const replacements = [
    [
      '  coffee_capsules: "Платена услуга: кафе капсули. Housekeeping доставя, рецепцията начислява към сметката на стаята.",',
      '  coffee_capsules: "Housekeeping доставя заявените кафе капсули.",'
    ],
    [
      '  pillow_menu: "Платена услуга: меню възглавници. Housekeeping доставя, рецепцията начислява към сметката на стаята.",',
      '  pillow_menu: "Housekeeping доставя избраната възглавница.",'
    ],
    [
      '  massage_booking: "Платена услуга: масаж / релакс терапия. Рецепцията трябва да начисли услугата към сметката на стаята.",',
      '  massage_booking: "Рецепцията трябва да потвърди часа/наличността на избраната услуга.",'
    ],
    [
      '  spa_massage: "Платена услуга: масаж / релакс терапия. Рецепцията трябва да начисли услугата към сметката на стаята.",',
      '  spa_massage: "Рецепцията трябва да потвърди часа/наличността на избраната услуга.",'
    ],
  ];

  for (const [from, to] of replacements) {
    if (s.includes(from)) s = s.replace(from, to);
  }

  // Repair accidental broken string constants from previous patches, if present.
  s = s.replace(/\.join\("\r?\n\r?\n"\)/g, '.join("\\n\\n")');
  s = s.replace(/\.join\("\r?\n"\)/g, '.join("\\n")');

  // Make paid-service note formatting deterministic and avoid repeated billing text.
  const oldFormatter = `function formatBillingNotice(metadata: RequestMetadata) {
  if (!metadata.requiresBilling) return "";

  const price = cleanText(metadata.price);
  const currency = cleanText(metadata.currency);
  const amount = [price, currency].filter(Boolean).join(" ");

  return amount
    ? \`Платена услуга. Цена: \${amount}. Рецепцията трябва да начисли услугата към сметката на стаята.\`
    : "Платена услуга. Рецепцията трябва да начисли услугата към сметката на стаята.";
}`;

  const newFormatter = `function formatBillingNotice(metadata: RequestMetadata) {
  if (!metadata.requiresBilling) return "";

  const price = cleanText(metadata.price).replace(/\\s*€\\s*$/, "");
  const currency = cleanText(metadata.currency) || (cleanText(metadata.price).includes("€") ? "€" : "");
  const amount = [price, currency].filter(Boolean).join(" ").trim();

  return amount
    ? \`Платена услуга. Цена: \${amount}. Рецепцията трябва да начисли услугата към сметката на стаята.\`
    : "Платена услуга. Рецепцията трябва да начисли услугата към сметката на стаята.";
}`;

  if (s.includes(oldFormatter)) s = s.replace(oldFormatter, newFormatter);

  // If the helper had old double-newline string literals, normalize only the target cases.
  s = s.replace(/return \[details, STAFF_NOTES_BG\[key\], billingNotice\]\.filter\(Boolean\)\.join\("\\n\\n"\) \|\| undefined;/g,
    'return [details, STAFF_NOTES_BG[key], billingNotice].filter(Boolean).join("\\n\\n") || undefined;');

  write(rel, s);
  console.log(`Patched ${rel}`);
}

const guestHelpers = `
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

function patchGuestHub() {
  const rel = 'components/GuestHub.tsx';
  let s = read(rel);

  if (!s.includes('function submitRequestDefSelectionOption')) {
    const anchor = '  function buildRequestDefItems(category: string): HubItem[] {';
    s = replaceOnce(s, anchor, guestHelpers + '\n' + anchor, 'insert request def quick action helpers');
  }

  const hrefAnchor = `        if (href && (def.type === "pdf" || def.type === "external_link" || def.type === "link")) {
          return {
            label,
            kind: "link" as const,
            href,
            newTab: true,
          };
        }

        return {
          label,
          kind: "link" as const,
          onClick: () => handleRequestDefClick(def),
        };`;

  const hrefReplacement = `        if (def.type === "request" && (def.requestKind === "selection" || def.requestKind === "quantity" || def.requiresQuantity)) {
          return {
            label,
            kind: "request_def" as const,
            requestDef: def,
          } as any;
        }

        if (href && (def.type === "pdf" || def.type === "external_link" || def.type === "link")) {
          return {
            label,
            kind: "link" as const,
            href,
            newTab: true,
          };
        }

        return {
          label,
          kind: "link" as const,
          onClick: () => handleRequestDefClick(def),
        };`;

  if (s.includes(hrefAnchor) && !s.includes('kind: "request_def" as const')) {
    s = s.replace(hrefAnchor, hrefReplacement);
  }

  const renderAnchor = `                if (it.kind === "link" && it.onClick) {
                  return (`;

  const requestDefRender = `                const requestDefItem = it as any;
                if (requestDefItem.kind === "request_def" && requestDefItem.requestDef) {
                  const def = requestDefItem.requestDef as RequestDef;
                  const title = getRequestDefTitle(def) || String(it.label || def.id.replace(/_/g, " "));
                  const icon = getRequestDefButtonIcon(def);
                  const message = getRequestDefMessage(def);
                  const priceHint = getRequestDefPriceHint(def);
                  const localizedOptions = getRequestDefOptions(def);
                  const isQuantity = def.requestKind === "quantity" || def.requiresQuantity;

                  return (
                    <div key={idx} className="rounded-xl stayhub-card p-3 text-sm">
                      <div className="font-semibold text-white">
                        {icon ? \`\${icon} \` : ""}{title}
                      </div>

                      {message ? (
                        <div className="mt-1 whitespace-pre-wrap text-[color:var(--stayhub-text)]/90">
                          {message}
                        </div>
                      ) : null}

                      {priceHint ? (
                        <div className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}>
                          {lang === "bg" ? "Цена" : lang === "de" ? "Preis" : lang === "ro" ? "Preț" : lang === "cs" ? "Cena" : "Price"}: {priceHint}
                        </div>
                      ) : null}

                      {isQuantity ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {getQuantityChoices(def).map((qty) => (
                            <button
                              key={qty}
                              type="button"
                              disabled={submittingRequest}
                              onClick={() => submitRequestDefQuantityChoice(def, qty)}
                              className="rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {getQuantityButtonLabel(def, qty)}
                            </button>
                          ))}
                        </div>
                      ) : localizedOptions.length ? (
                        <div className="mt-3 space-y-2">
                          {localizedOptions.map((option, optionIndex) => (
                            <button
                              key={\`\${def.id}-\${optionIndex}\`}
                              type="button"
                              disabled={submittingRequest}
                              onClick={() => submitRequestDefSelectionOption(def, option, optionIndex)}
                              className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={submittingRequest}
                          onClick={() => handleRequestDefClick(def)}
                          className="mt-3 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {lang === "bg" ? "Изпрати заявка" : lang === "de" ? "Anfrage senden" : lang === "ro" ? "Trimite solicitarea" : lang === "cs" ? "Odeslat požadavek" : "Send request"}
                        </button>
                      )}
                    </div>
                  );
                }

`;

  if (s.includes(renderAnchor) && !s.includes('requestDefItem.kind === "request_def"')) {
    s = s.replace(renderAnchor, requestDefRender + renderAnchor);
  }

  const oldRefresh = `                className="rounded-xl px-3 py-2 text-xs font-semibold text-white ring-1 ring-neutral-700 transition hover:bg-neutral-800/70 disabled:cursor-not-allowed disabled:opacity-50"
              >`;
  const newRefresh = `                className="rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)", border: "1px solid #202627" }}
              >`;
  if (s.includes(oldRefresh)) s = s.replace(oldRefresh, newRefresh);

  write(rel, s);
  console.log(`Patched ${rel}`);
}

patchOpsCopy();
patchGuestHub();
console.log('Done. Run: npm run build');
