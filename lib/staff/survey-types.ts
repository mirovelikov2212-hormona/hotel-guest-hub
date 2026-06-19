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
  problemText: string;
  resolutionStatus: Day3SurveyResolutionStatus | null;
  resolutionNote: string;
  language: string;
  surveyVersion: string;
  hotelDateKey: string;
  targetDateKey: string | null;
  firstConfirmedDateKey: string | null;
  guestSubmittedAt: string;
  activeUntil: string;
  managerReadAt: string | null;
  receptionReadAt: string | null;
  createdAt: string;
};

export type Day3SurveyApiResponse = {
  ok: boolean;
  activeSurveys?: Day3Survey[];
  reportSurveys?: Day3Survey[];
  error?: string;
};
