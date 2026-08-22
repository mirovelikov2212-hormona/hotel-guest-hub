"use client";

import { useState } from "react";

type Props = {
  hotelSlug: string;
};

export default function ReceptionPinRepair({ hotelSlug }: Props) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/staff/credentials/reception-pin-repair", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          pin,
          confirmPin,
          repairReceptionPin: approved,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(String(data?.error || "Reception PIN repair failed."));
        return;
      }

      setMessage(
        data.hashRepaired
          ? "Reception PIN hash was repaired. Use the same PIN to sign in to Reception."
          : "The current Reception PIN hash already validates this PIN. Retry Reception sign-in once.",
      );
    } catch {
      setError("Reception PIN repair could not reach the server.");
    } finally {
      setPin("");
      setConfirmPin("");
      setApproved(false);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <div className="text-sm uppercase tracking-[0.2em] text-white/50">Manager protected repair</div>
        <h1 className="mt-2 text-2xl font-semibold">Reception PIN hash repair</h1>
        <p className="mt-3 text-sm leading-6 text-white/65">
          Enter the same 6-digit Reception PIN twice. This does not intentionally change the PIN digits.
          It regenerates the stored hash only if the existing hash no longer validates this PIN.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-white/70">Reception PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{6}"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/30"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-white/70">Repeat Reception PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{6}"
              maxLength={6}
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/30"
              required
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
              className="mt-1"
              required
            />
            <span>I confirm that I am entering the existing Reception PIN and want only its stored hash repaired.</span>
          </label>

          {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
          {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}

          <button
            type="submit"
            disabled={loading || !approved || pin.length !== 6 || confirmPin.length !== 6}
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black disabled:opacity-50"
          >
            {loading ? "Repairing..." : "Repair Reception PIN hash"}
          </button>
        </form>
      </div>
    </main>
  );
}
