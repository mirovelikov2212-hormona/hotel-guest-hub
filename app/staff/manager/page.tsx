"use client";

import { useMemo } from "react";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { getRequestSummary } from "@/lib/staff/mock-data";
import { staffDepartmentLabels, type StaffDepartment } from "@/lib/staff/types";

export default function ManagerPage() {
  const { getAllRequests } = useStaffStore();

  const requests = getAllRequests();

  const grouped = useMemo(() => {
    const map: Record<string, typeof requests> = {};

    for (const req of requests) {
      if (!map[req.department]) {
        map[req.department] = [];
      }
      map[req.department].push(req);
    }

    return map;
  }, [requests]);

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold tracking-tight">
          Manager Dashboard
        </h2>
        <p className="mt-2 text-sm text-white/70">
          Full operational overview across all departments.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grouped).map(([department, reqs]) => {
          const stats = getRequestSummary(reqs);

          return (
            <DepartmentCard
              key={department}
              department={department as StaffDepartment}
              stats={stats}
            />
          );
        })}
      </section>
    </main>
  );
}

function DepartmentCard({
  department,
  stats,
}: {
  department: StaffDepartment;
  stats: ReturnType<typeof getRequestSummary>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-lg font-semibold">
        {staffDepartmentLabels[department] || department}
      </h3>

      <div className="mt-4 space-y-2 text-sm text-white/70">
        <p>Total: {stats.total}</p>
        <p>New: {stats.newCount}</p>
        <p>In Progress: {stats.inProgressCount}</p>
        <p>Completed: {stats.completedCount}</p>
        <p className="text-rose-300">Returned: {stats.returnedCount}</p>
      </div>
    </div>
  );
}