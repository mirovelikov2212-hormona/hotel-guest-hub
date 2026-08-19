from __future__ import annotations

import json
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


reception_path = Path("components/staff/pages/ReceptionPageContent.tsx")
reception = reception_path.read_text(encoding="utf-8")

reception = replace_once(
    reception,
    '''  const actionableRequests = useMemo(
    () =>
      filteredRequests.filter(
        (request) =>
          request.department === "reception" ||
          request.department === "housekeeping" ||
          request.department === "maintenance",
      ),
    [filteredRequests],
  );

''',
    "",
    "remove visibility-dropping actionableRequests filter",
)

reception = replace_once(
    reception,
    '''export default function ReceptionPage({
''',
    '''function isReceptionOperationalDepartment(department: string) {
  return (
    department === "reception" ||
    department === "housekeeping" ||
    department === "maintenance"
  );
}

export default function ReceptionPage({
''',
    "insert explicit Reception operational-authority predicate",
)

reception = replace_once(
    reception,
    "        {actionableRequests.length ? (",
    "        {filteredRequests.length ? (",
    "render all filtered tenant requests",
)

reception = replace_once(
    reception,
    '''          actionableRequests.map((request) => {
            const requestAgeMinutes = getRequestAgeMinutes(request, nowMs);
''',
    '''          filteredRequests.map((request) => {
            const requestAgeMinutes = getRequestAgeMinutes(request, nowMs);
            const canReceptionAct = isReceptionOperationalDepartment(request.department);
''',
    "derive per-request Reception authority",
)

reception = replace_once(
    reception,
    "                canAct\n",
    "                canAct={canReceptionAct}\n",
    "fail-close operational actions for custom departments",
)

reception = replace_once(
    reception,
    "                canCharge={Boolean(request.requiresBilling)}",
    "                canCharge={canReceptionAct && Boolean(request.requiresBilling)}",
    "fail-close billing actions for custom departments",
)

reception_path.write_text(reception, encoding="utf-8")

card_path = Path("components/staff/StaffRequestCard.tsx")
card = card_path.read_text(encoding="utf-8")
card = replace_once(
    card,
    'import { staffDepartmentClasses, staffStatusClasses } from "@/lib/staff/types";',
    'import { getStaffDepartmentClass, staffStatusClasses } from "@/lib/staff/types";',
    "use generic department class helper",
)
card = replace_once(
    card,
    "${staffDepartmentClasses[request.department]}",
    "${getStaffDepartmentClass(request.department)}",
    "style custom department badge with fallback",
)
card_path.write_text(card, encoding="utf-8")

package_path = Path("package.json")
package = json.loads(package_path.read_text(encoding="utf-8"))
scripts = package.setdefault("scripts", {})
contract_command = "node --test tests/contracts/reception-custom-department-visibility.contract.test.mjs"
existing_contracts = str(scripts.get("test:contracts", "")).strip()
if not existing_contracts:
    raise SystemExit("package.json: missing test:contracts")
if contract_command not in existing_contracts:
    scripts["test:contracts"] = f"{existing_contracts} && {contract_command}"
scripts["test:reception-custom-department-visibility"] = contract_command
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print("Reception custom-department visibility transform applied with exact guards.")
