import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function logControlPlaneAudit(input: {
  actorAdminId?: string | null;
  organizationId?: string | null;
  propertyId?: string | null;
  hotelId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const action = String(input.action || "").trim();
  const resourceType = String(input.resourceType || "").trim();
  if (!action || !resourceType) {
    throw new Error("CONTROL_PLANE_AUDIT_INVALID");
  }

  const { error } = await supabaseAdmin
    .from("control_plane_audit_log")
    .insert({
      actor_admin_id: input.actorAdminId || null,
      organization_id: input.organizationId || null,
      property_id: input.propertyId || null,
      hotel_id: input.hotelId || null,
      action,
      resource_type: resourceType,
      resource_id: input.resourceId || null,
      metadata_json: input.metadata || {},
    });

  if (error) {
    throw new Error(`CONTROL_PLANE_AUDIT_WRITE_FAILED:${error.message}`);
  }
}
