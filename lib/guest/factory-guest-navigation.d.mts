export type FactoryGuestDepartmentGroup<T> = {
  departmentCode: string;
  departmentName: string;
  requestDefs: T[];
};

export function buildFactoryGuestDepartmentGroups<
  T extends Record<string, unknown>,
>(definitions?: T[]): FactoryGuestDepartmentGroup<T>[];
