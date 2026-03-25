import { redirect } from "next/navigation";

export default function LegacyMaintenanceRedirectPage() {
  redirect("/staff/demo/maintenance");
}
