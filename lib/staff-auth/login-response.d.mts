export type StaffLoginErrorPayload = {
  code?: unknown;
  error?: unknown;
  retryAfterSeconds?: unknown;
};

export function getStaffLoginErrorMessage(
  status: number,
  payload: StaffLoginErrorPayload | null | undefined,
): string;

export function getStaffLoginNetworkErrorMessage(): string;
