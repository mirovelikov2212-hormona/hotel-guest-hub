export type FactoryGuestDepartmentGroup<T> = {
  departmentCode: string;
  departmentName: string;
  requestDefs: T[];
};

export function buildFactoryGuestDepartmentGroups<T extends object>(
  definitions?: T[],
): FactoryGuestDepartmentGroup<T>[];
