export type Day3SurveyResolutionStatus =
  | "fully_resolved"
  | "partially_resolved"
  | "not_resolved"
  | "not_informed";

export type Day3Survey = {
  id: string;
  room: string;
  rating: number;
  selectedCategories: string[];
  improvementText: string;
  improvementTextOriginal?: string;
  improvementTextBg?: string;
  improvementTextEn?: string;
  improvementTextDe?: string;
  problemText: string;
  problemTextOriginal?: string;
  problemTextBg?: string;
  problemTextEn?: string;
  problemTextDe?: string;
  resolutionStatus: Day3SurveyResolutionStatus | null;
  resolutionNote: string;
  resolutionNoteOriginal?: string;
  resolutionNoteBg?: string;
  resolutionNoteEn?: string;
  resolutionNoteDe?: string;
  language: string;
  surveyVersion: string;
  hotelDateKey: string;
  targetDateKey: string | null;
  firstConfirmedDateKey: string | null;
  guestSubmittedAt: string;
  activeUntil: string;
  managerReadAt: string | null;
  receptionReadAt: string | null;
  isTest?: boolean;
  testExpiresAt?: string | null;
  createdAt: string;
};

export type Day3SurveyApiResponse = {
  ok: boolean;
  activeSurveys?: Day3Survey[];
  reportSurveys?: Day3Survey[];
  error?: string;
};
