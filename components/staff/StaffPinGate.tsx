"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

type Props = {
  hotelSlug: string;
  role: StaffRole;
  nextPath: string;
};

export default function StaffPinGate({ hotelSlug, role, nextPath }: Props) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/staff/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotelSlug,
          role,
          pin,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.error || "PIN login failed");
        setLoading(false);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Unexpected login error");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <div className="mb-6">
          <div className="text-sm uppercase tracking-[0.2em] text-white/50">StayHub Staff Access</div>
          <h1 className="mt-2 text-2xl font-semibold">{hotelSlug} / {role}</h1>
          <p className="mt-2 text-sm text-white/60">
            Enter the department PIN to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pin" className="mb-2 block text-sm text-white/70">
              Department PIN
            </label>
            <input
              id="pin"
              type="password"
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
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