import test from "node:test";

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
