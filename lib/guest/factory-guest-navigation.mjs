// Exact-head release checkpoint for data-driven Factory Guest navigation.
function normalize(value) {
  return String(value || "").trim();
}

function humanizeDepartmentCode(value) {
  const normalized = normalize(value).replace(/[_-]+/g, " ");
  if (!normalized) return "Services";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isGuestVisible(definition) {
  return Boolean(
    definition &&
      definition.enabled !== false &&
      definition.guestVisible !== false,
  );
}

export function buildFactoryGuestDepartmentGroups(definitions = []) {
  const groups = new Map();

  for (const definition of Array.isArray(definitions) ? definitions : []) {
    if (!isGuestVisible(definition)) continue;

    const departmentCode = normalize(definition?.targetDepartment).toLowerCase();
    if (!departmentCode) continue;

    const configuredName = normalize(definition?.factoryDepartmentName);
    const current = groups.get(departmentCode);
    if (current) {
      current.requestDefs.push(definition);
      if (!current.departmentName && configuredName) {
        current.departmentName = configuredName;
      }
      continue;
    }

    groups.set(departmentCode, {
      departmentCode,
      departmentName: configuredName || humanizeDepartmentCode(departmentCode),
      requestDefs: [definition],
    });
  }

  return Array.from(groups.values());
}
