import test from "node:test";
import assert from "node:assert/strict";

import {
  assertContains,
  assertBefore,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("manager survey UI keeps a direct problem map with staff-notified status", async () => {
  const source = await readProjectFile("components/staff/StaffSurveyCards.tsx");

  assertContains(source, 'problemsMapTitle: "Карта на проблемите"');
  assertContains(source, 'staffInformed: "Подадени към персонала"');
  assertContains(source, 'staffNotInformed: "Не са подадени"');
  assertContains(source, "export function buildSurveyProblemEntries");
  assertContains(source, '.filter((survey) => String(survey.problemText || "").trim().length > 0)');
  assertContains(source, 'staffInformed: survey.resolutionStatus !== "not_informed"');
  assertContains(source, 'survey.resolutionStatus !== "fully_resolved"');
});

test("new problems are visible immediately and historical problems remain in the survey report", async () => {
  const source = await readProjectFile("components/staff/StaffSurveyCards.tsx");
  const todayStart = source.indexOf("export function ManagerTodaySurveysCard");
  const reportStart = source.indexOf("export function ManagerSurveyReportCard");

  if (todayStart < 0 || reportStart < 0) {
    throw new Error("Expected Manager survey cards.");
  }

  const todaySource = source.slice(todayStart, reportStart);
  const reportSource = source.slice(reportStart);

  assertContains(todaySource, "<SurveyProblemsMap surveys={surveys} lang={lang} compact />");
  assertContains(reportSource, "<SurveyProblemsMap surveys={surveys} lang={lang} />");
  assertBefore(reportSource, "<SurveyProblemsMap surveys={surveys} lang={lang} />", "summaries.map");
});

test("staff survey translation uses the authoritative guest locale instead of Cyrillic script detection", async () => {
  const source = await readProjectFile("lib/server/staff-translation.ts");

  assertContains(source, 'if (targetLanguage === "bg") {');
  assertContains(source, 'return source.startsWith("bg");');
  assert.doesNotMatch(
    source,
    /if \(targetLanguage === "bg"\) return hasBulgarianLetters\(text\);/,
    "Russian/Macedonian Cyrillic must not be accepted as Bulgarian merely because it is Cyrillic.",
  );
});

test("staff survey read path self-heals legacy non-Bulgarian text from the canonical translation columns", async () => {
  const source = await readProjectFile("app/api/staff/surveys/route.ts");

  assertContains(source, 'if (source.startsWith("bg")) return false;');
  assertContains(source, "row.improvement_text_bg, metadata, row.language");
  assertContains(source, "row.problem_text_bg, metadata, row.language");
  assertContains(source, "row.resolution_note_bg, metadata, row.language");
  assertContains(source, "metadata.staff_translation_attempted_at");
  assert.doesNotMatch(
    source,
    /hasBulgarianLetters\(raw\)/,
    "Backfill must not use shared Cyrillic script as a Bulgarian language detector.",
  );
});
