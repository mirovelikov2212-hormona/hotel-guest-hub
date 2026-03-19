import type { StaffRequest, StaffRequestStatus } from "@/lib/staff/types";
import {
  staffDepartmentClasses,
  staffDepartmentLabels,
  staffServiceTimeLabels,
  staffStatusClasses,
  staffStatusLabels,
} from "@/lib/staff/types";

type StaffRequestCardProps = {
  request: StaffRequest;
  mode: "department" | "reception" | "manager";
  canAct?: boolean;
  onStart?: (id: string) => void;
  onDone?: (id: string) => void;
  onReturn?: (id: string) => void;
};

export default function StaffRequestCard({
  request,
  mode,
  canAct = false,
  onStart,
  onDone,
  onReturn,
}: StaffRequestCardProps) {
  const isNew = request.status === "new";
  const isInProgress = request.status === "in_progress";

  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
              Room {request.room}
            </span>

            {mode !== "department" ? (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${staffDepartmentClasses[request.department]}`}
              >
                {staffDepartmentLabels[request.department]}
              </span>
            ) : null}

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${staffStatusClasses[request.status]}`}
            >
              {staffStatusLabels[request.status]}
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
              {staffServiceTimeLabels[request.serviceTime]}
            </span>
          </div>

          <div>
            <h3 className="text-2xl font-semibold tracking-tight">
              {request.typeLabel}
            </h3>
            <p className="mt-1 text-sm text-white/50">
              Requested at {request.createdAt}
            </p>
          </div>

          {request.note ? (
            <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/75">
              {request.note}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-72">
          {mode === "manager" ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/70">
              Manager view only. Operational visibility across all departments.
            </div>
          ) : null}

          {mode === "reception" && !canAct ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/70">
              Reception monitoring only. Execution happens in the assigned
              department view.
            </div>
          ) : null}

          {canAct && isNew ? (
            <>
              <button
                type="button"
                onClick={() => onStart?.(request.id)}
                className="min-h-14 rounded-2xl bg-sky-500 px-4 text-base font-semibold text-white transition hover:bg-sky-400"
              >
                START
              </button>

              <button
                type="button"
                onClick={() => onReturn?.(request.id)}
                className="min-h-14 rounded-2xl border border-rose-400/30 bg-rose-400/15 px-4 text-base font-semibold text-rose-100 transition hover:bg-rose-400/25"
              >
                RETURN
              </button>
            </>
          ) : null}

          {canAct && isInProgress ? (
            <button
              type="button"
              onClick={() => onDone?.(request.id)}
              className="min-h-14 rounded-2xl bg-emerald-500 px-4 text-base font-semibold text-white transition hover:bg-emerald-400"
            >
              DONE
            </button>
          ) : null}

          {canAct && !isNew && !isInProgress ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-center text-sm font-medium text-white/50">
              No actions available
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}