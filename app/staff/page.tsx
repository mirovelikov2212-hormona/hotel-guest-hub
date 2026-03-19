import Link from "next/link";

type StaffAreaCard = {
  title: string;
  description: string;
  href: string;
  badge: string;
};

const staffAreas: StaffAreaCard[] = [
  {
    title: "Housekeeping",
    description:
      "Room supply requests like towels, toilet paper, pillows, blankets, bathrobes and slippers.",
    href: "/staff/housekeeping",
    badge: "Department",
  },
  {
    title: "Maintenance",
    description:
      "Broken items, air conditioning issues, no hot water, lighting and other technical problems.",
    href: "/staff/maintenance",
    badge: "Department",
  },
  {
    title: "Reception",
    description:
      "Overview of all guest requests across departments. Monitor statuses, returns and unresolved tasks.",
    href: "/staff/reception",
    badge: "Control",
  },
  {
    title: "Manager",
    description:
      "Operational overview, status visibility and future reporting for all departments.",
    href: "/staff/manager",
    badge: "Management",
  },
];

export default function StaffHubHomePage() {
  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-xl font-semibold tracking-tight">
          Staff Hub Modules
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
          This is the internal staff side of GuestHub. We are keeping the
          interface intentionally simple: clear task lists, readable cards and
          fast actions. No guest room-cleaning workflow here. Only optional
          guest requests and department operations.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {staffAreas.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/70">
                {area.badge}
              </span>

              <span className="text-sm text-white/40 transition group-hover:text-white/70">
                Open →
              </span>
            </div>

            <h3 className="text-lg font-semibold">{area.title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {area.description}
            </p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
        <h3 className="text-base font-semibold text-amber-200">
          Confirmed product decisions
        </h3>

        <div className="mt-3 grid gap-3 text-sm leading-6 text-amber-50/90 sm:grid-cols-2">
          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">
            Guest requests include only optional requests such as towels,
            toilet paper, pillow, blanket, bathrobe, slippers, baby cot,
            maintenance, taxi, wake-up call, late checkout and information.
          </div>

          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">
            Mandatory hotel operations such as room cleaning are not part of
            the guest request flow.
          </div>

          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">
            Reception sees all requests first for monitoring, while departments
            work on their own requests.
          </div>

          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">
            Staff task flow is kept simple: Start, Done, Return.
          </div>
        </div>
      </section>
    </main>
  );
}