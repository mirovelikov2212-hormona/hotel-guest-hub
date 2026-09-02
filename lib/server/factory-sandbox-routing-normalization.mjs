export function normalizeFactoryRoutingKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

export function buildRequestedFactoryRoutingAuthority(input) {
  const requestedTypes = Array.from(
    new Set(
      (Array.isArray(input?.requestedTypes) ? input.requestedTypes : [])
        .map(normalizeFactoryRoutingKey)
        .filter(Boolean),
    ),
  );
  const requestedTypeSet = new Set(requestedTypes);
  const departmentIds = new Set(
    (Array.isArray(input?.departmentIds) ? input.departmentIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const routingRows = Array.isArray(input?.routingRows) ? input.routingRows : [];
  const routingDepartmentIdByRequestType = Object.create(null);

  for (const row of routingRows) {
    const requestType = normalizeFactoryRoutingKey(row?.request_type);
    if (!requestType || !requestedTypeSet.has(requestType)) continue;

    const departmentId = String(row?.department_id || "").trim();
    if (
      !departmentIds.has(departmentId)
      || routingDepartmentIdByRequestType[requestType]
    ) {
      throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_ROUTING_INVALID");
    }
    routingDepartmentIdByRequestType[requestType] = departmentId;
  }

  return {
    requestedTypes,
    routingDepartmentIdByRequestType,
  };
}
