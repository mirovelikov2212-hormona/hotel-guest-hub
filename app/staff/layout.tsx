import type { ReactNode } from "react";
import { StaffStoreProvider } from "@/components/staff/store/StaffStoreProvider";

export const metadata = {
  title: "GuestHub Staff",
  description: "Staff Hub for hotel departments",
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffStoreProvider>
      <div className="min-h-screen bg-neutral-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <header className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/50">
                  GuestHub
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Staff Hub
                </h1>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                Simple operational view for hotel staff
              </div>
            </div>
          </header>

          {children}
        </div>
      </div>
    </StaffStoreProvider>
  );
}