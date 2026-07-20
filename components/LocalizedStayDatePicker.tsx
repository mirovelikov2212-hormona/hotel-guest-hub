"use client";

import { useEffect, useMemo, useState } from "react";
import type { LangKey } from "@/lib/types";

type LocalizedStayDatePickerProps = {
  value: string;
  min?: string;
  max?: string;
  todayDateKey?: string;
  lang: LangKey;
  ariaLabel: string;
  onChange: (value: string) => void;
};

type PickerCopy = {
  clear: string;
  today: string;
  previousMonth: string;
  nextMonth: string;
  close: string;
  selectDate: string;
};

const LOCALE_BY_LANG: Record<string, string> = {
  bg: "bg-BG",
  en: "en-GB",
  de: "de-DE",
  ro: "ro-RO",
  cs: "cs-CZ",
  ru: "ru-RU",
};

const COPY_BY_LANG: Record<string, PickerCopy> = {
  bg: {
    clear: "Изчисти",
    today: "Днес",
    previousMonth: "Предишен месец",
    nextMonth: "Следващ месец",
    close: "Затвори",
    selectDate: "Изберете дата",
  },
  en: {
    clear: "Clear",
    today: "Today",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    close: "Close",
    selectDate: "Select a date",
  },
  de: {
    clear: "Löschen",
    today: "Heute",
    previousMonth: "Vorheriger Monat",
    nextMonth: "Nächster Monat",
    close: "Schließen",
    selectDate: "Datum auswählen",
  },
  ro: {
    clear: "Șterge",
    today: "Astăzi",
    previousMonth: "Luna anterioară",
    nextMonth: "Luna următoare",
    close: "Închide",
    selectDate: "Alegeți o dată",
  },
  cs: {
    clear: "Vymazat",
    today: "Dnes",
    previousMonth: "Předchozí měsíc",
    nextMonth: "Další měsíc",
    close: "Zavřít",
    selectDate: "Vyberte datum",
  },
  ru: {
    clear: "Очистить",
    today: "Сегодня",
    previousMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    close: "Закрыть",
    selectDate: "Выберите дату",
  },
};

function normalizeDateKey(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function dateKeyToUtcDate(value: string) {
  const normalized = normalizeDateKey(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDateToDateKey(date: Date) {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getTodayDateKey() {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function clampDateKey(value: string, min?: string, max?: string) {
  const normalized = normalizeDateKey(value);
  if (!normalized) return "";
  const normalizedMin = normalizeDateKey(min);
  const normalizedMax = normalizeDateKey(max);
  if (normalizedMin && normalized < normalizedMin) return normalizedMin;
  if (normalizedMax && normalized > normalizedMax) return normalizedMax;
  return normalized;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export default function LocalizedStayDatePicker({
  value,
  min,
  max,
  todayDateKey: todayDateKeyInput,
  lang,
  ariaLabel,
  onChange,
}: LocalizedStayDatePickerProps) {
  const langKey = String(lang || "en").toLowerCase();
  const locale = LOCALE_BY_LANG[langKey] || LOCALE_BY_LANG.en;
  const copy = COPY_BY_LANG[langKey] || COPY_BY_LANG.en;
  const normalizedValue = normalizeDateKey(value);
  const normalizedMin = normalizeDateKey(min);
  const normalizedMax = normalizeDateKey(max);
  const todayDateKey = normalizeDateKey(todayDateKeyInput) || getTodayDateKey();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = dateKeyToUtcDate(
      clampDateKey(normalizedValue || todayDateKey, normalizedMin, normalizedMax),
    );
    return startOfUtcMonth(initialDate || new Date());
  });

  useEffect(() => {
    if (!open) return;
    const nextDate = dateKeyToUtcDate(
      clampDateKey(normalizedValue || todayDateKey, normalizedMin, normalizedMax),
    );
    if (nextDate) setVisibleMonth(startOfUtcMonth(nextDate));
  }, [normalizedMax, normalizedMin, normalizedValue, open, todayDateKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const selectedDateLabel = useMemo(() => {
    const selected = dateKeyToUtcDate(normalizedValue);
    if (!selected) return copy.selectDate;
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(selected);
  }, [copy.selectDate, locale, normalizedValue]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(visibleMonth),
    [locale, visibleMonth],
  );

  const weekdayLabels = useMemo(() => {
    const monday = new Date(Date.UTC(2024, 0, 1));
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        timeZone: "UTC",
      })
        .format(addUtcDays(monday, index))
        .replace(/\.$/, ""),
    );
  }, [locale]);

  const calendarDays = useMemo(() => {
    const firstDayIndex = (visibleMonth.getUTCDay() + 6) % 7;
    const gridStart = addUtcDays(visibleMonth, -firstDayIndex);
    return Array.from({ length: 42 }, (_, index) => addUtcDays(gridStart, index));
  }, [visibleMonth]);

  const canUseToday =
    (!normalizedMin || todayDateKey >= normalizedMin) &&
    (!normalizedMax || todayDateKey <= normalizedMax);

  const monthStartKey = utcDateToDateKey(visibleMonth);
  const monthEndKey = utcDateToDateKey(addUtcDays(addUtcMonths(visibleMonth, 1), -1));
  const previousMonthDisabled = Boolean(normalizedMin && monthStartKey <= normalizedMin.slice(0, 7) + "-01");
  const nextMonthDisabled = Boolean(normalizedMax && monthEndKey >= normalizedMax);

  const selectDate = (nextDateKey: string) => {
    if ((normalizedMin && nextDateKey < normalizedMin) || (normalizedMax && nextDateKey > normalizedMax)) {
      return;
    }
    onChange(nextDateKey);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl stayhub-card px-3 py-3 text-left text-sm outline-none transition hover:border-[#43baad] focus-visible:ring-2 focus-visible:ring-[#43baad]/35"
      >
        <span className={normalizedValue ? "text-[#202627]" : "text-[color:var(--stayhub-muted)]"}>
          {selectedDateLabel}
        </span>
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="shrink-0 text-[#178e84]"
        >
          <path d="M7 3V6M17 3V6M4.5 9H19.5M6 5H18C19.1046 5 20 5.89543 20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V7C4 5.89543 4.89543 5 6 5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 p-3 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="w-full max-w-sm rounded-[28px] border border-[#43baad]/35 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                aria-label={copy.previousMonth}
                disabled={previousMonthDisabled}
                onClick={() => setVisibleMonth((current) => addUtcMonths(current, -1))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#43baad]/30 text-xl text-[#075255] transition hover:bg-[#43baad]/10 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ‹
              </button>
              <div className="text-center text-base font-semibold capitalize text-[#075255]">
                {monthLabel}
              </div>
              <button
                type="button"
                aria-label={copy.nextMonth}
                disabled={nextMonthDisabled}
                onClick={() => setVisibleMonth((current) => addUtcMonths(current, 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#43baad]/30 text-xl text-[#075255] transition hover:bg-[#43baad]/10 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ›
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5d6f72]">
              {weekdayLabels.map((label, index) => (
                <div key={`${label}-${index}`} className="py-1">
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((date) => {
                const dateKey = utcDateToDateKey(date);
                const outsideMonth = date.getUTCMonth() !== visibleMonth.getUTCMonth();
                const disabled =
                  Boolean(normalizedMin && dateKey < normalizedMin) ||
                  Boolean(normalizedMax && dateKey > normalizedMax);
                const selected = dateKey === normalizedValue;
                const today = dateKey === todayDateKey;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => selectDate(dateKey)}
                    className={[
                      "relative flex aspect-square items-center justify-center rounded-xl text-sm font-medium transition",
                      selected
                        ? "bg-[#43baad] text-[#075255] shadow-sm"
                        : today
                          ? "border border-[#43baad] text-[#075255]"
                          : "text-[#202627] hover:bg-[#43baad]/10",
                      outsideMonth && !selected ? "opacity-35" : "",
                      disabled ? "cursor-not-allowed opacity-20 hover:bg-transparent" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {date.getUTCDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#43baad]/20 pt-3">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-[#075255] transition hover:bg-[#43baad]/10"
              >
                {copy.clear}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canUseToday}
                  onClick={() => selectDate(todayDateKey)}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-[#075255] transition hover:bg-[#43baad]/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {copy.today}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-[#43baad]/30 px-3 py-2 text-sm font-semibold text-[#075255] transition hover:bg-[#43baad]/10"
                >
                  {copy.close}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
