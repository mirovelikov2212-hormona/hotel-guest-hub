"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getStaffLoginErrorMessage,
  getStaffLoginNetworkErrorMessage,
} from "@/lib/staff-auth/login-response.mjs";
import { staffRoleDisplayName, type StaffRole } from "@/lib/staff/role-code";

type Props = {
  hotelSlug: string;
  role: StaffRole;
  nextPath: string;
  loginEndpoint?: string;
  roleDisplayName?: string;
};

function getHotelDisplayName(slug: string) {
  const value = String(slug || "").trim().toLowerCase();

  if (value === "aquamarin" || value === "aquamarine") return "Aquamarine";
  if (value === "demo") return "Hotel";

  if (!value) return "Hotel";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function StaffPinGate({
  hotelSlug,
  role,
  nextPath,
  loginEndpoint = "/api/staff/auth/login",
  roleDisplayName,
}: Props) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isPublicDemo = hotelSlug.trim().toLowerCase() === "demo";

  const hotelLabel = useMemo(() => getHotelDisplayName(hotelSlug), [hotelSlug]);
  const roleLabel = useMemo(
    () => roleDisplayName || staffRoleDisplayName(role),
    [role, roleDisplayName],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(loginEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotelSlug,
          role,
          pin,
        }),
      });

      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      const data = contentType.includes("application/json")
        ? await res.json().catch(() => null)
        : null;

      if (!res.ok || !data?.ok) {
        setPin("");
        setError(getStaffLoginErrorMessage(res.status, data));
        setLoading(false);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setPin("");
      setError(getStaffLoginNetworkErrorMessage());
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <div className="mb-6">
          <div className="text-sm uppercase tracking-[0.2em] text-white/50">StayHub Staff Access</div>
          <h1 className="mt-2 text-2xl font-semibold">
            {hotelLabel} / {roleLabel}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Enter the department PIN to continue.
          </p>

          {isPublicDemo ? (
            <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                GOSTAYA PUBLIC DEMO
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/80">
                <span>Demo room <strong className="text-white">901</strong></span>
                <span>PIN <strong className="tracking-[0.16em] text-white">2026</strong></span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/45">
                Demo tenant only · no access to a real hotel.
              </p>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pin" className="mb-2 block text-sm text-white/70">
              Department PIN
            </label>
            <input
              id="pin"
              type={isPublicDemo ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/30"
              placeholder="Enter PIN"
              required
            />
          </div>

          {error ? (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
          >
            {loading ? "Checking PIN..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
