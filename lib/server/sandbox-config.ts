import "server-only";

import {
  isSandboxHotel,
  resolveHotelByAnySlugAdmin,
} from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type CloneSandboxConfigOptions = {
  sandboxHotelSlug: string;
  expectedProductionRevisionId: string;
  actor?: string | null;
};

type CloneSandboxConfigResult = {
  ok?: boolean;
  changed?: boolean;
  deduplicated?: boolean;
  sandbox_hotel_id?: string;
  production_hotel_id?: string;
  production_revision_id?: string;
  revision_id?: string;
  revision_no?: number;
  status?: string;
  source_checksum?: string;
};

function requiredText(value: unknown, code: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export async function cloneSandboxConfigFromProduction(
  options: CloneSandboxConfigOptions,
): Promise<CloneSandboxConfigResult> {
  const sandboxHotelSlug = requiredText(
    options.sandboxHotelSlug,
    "M11_SANDBOX_HOTEL_SLUG_REQUIRED",
  );
  const expectedProductionRevisionId = requiredText(
    options.expectedProductionRevisionId,
    "M11_PRODUCTION_REVISION_ID_REQUIRED",
  );

  const sandboxHotel = await resolveHotelByAnySlugAdmin(sandboxHotelSlug);

  if (!isSandboxHotel(sandboxHotel)) {
    throw new Error("M11_SANDBOX_HOTEL_REQUIRED");
  }

  if (!sandboxHotel.production_hotel_id) {
    throw new Error("M11_SANDBOX_PRODUCTION_LINK_REQUIRED");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "clone_production_config_to_sandbox_draft",
    {
      p_sandbox_hotel_id: sandboxHotel.id,
      p_expected_production_revision_id: expectedProductionRevisionId,
      p_actor: String(options.actor || "m11_sandbox_clone").trim(),
    },
  );

  if (error) {
    throw new Error(`M11_SANDBOX_CONFIG_CLONE_FAILED: ${error.message}`);
  }

  const result = (data || {}) as CloneSandboxConfigResult;

  if (
    result.ok !== true ||
    result.sandbox_hotel_id !== sandboxHotel.id ||
    result.production_hotel_id !== sandboxHotel.production_hotel_id ||
    result.production_revision_id !== expectedProductionRevisionId ||
    !result.revision_id
  ) {
    throw new Error("M11_SANDBOX_CONFIG_CLONE_RESULT_INVALID");
  }

  return result;
}
