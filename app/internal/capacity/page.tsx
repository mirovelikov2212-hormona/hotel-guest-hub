import { notFound } from "next/navigation";
import { CapacityRunner } from "./CapacityRunner";

export const dynamic = "force-dynamic";

export default function CapacityPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <CapacityRunner />;
}
