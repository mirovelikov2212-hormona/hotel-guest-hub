import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FactoryRunSummary = {
  onboardingRunId: string;
  blueprintHash: string;
  createdAt: string;
  property: {
    id: string;
    propertyKey: string;
    displayName: string;
    lifecycleState: string;
  };
  production: {
    hotelId: string;
    slug: string;
    publicSlug: string | null;
    active: boolean;
    isSandbox: boolean;
    isDemo: boolean;
  };
  sandbox: {
    hotelId: string;
    slug: string;
    publicSlug: string | null;
    active: boolean;
    isSandbox: boolean;
    isDemo: boolean;
  };
  coreCompleted: boolean;
  operationalCompleted: boolean;
  envelopeCompleted: boolean;
  nativeContentCompleted: boolean;
  currentStage: "foundation" | "core" | "operational" | "envelope" | "native_content";
};

type ProjectionBase = {
  projectionRunId: string;
  status: "completed";
  productionRevisionId: string;
  sandboxRevisionId: string;
  createdAt: string;
};

type NativeProjection = {
  projectionRunId: string;
  status: "completed";
  nativeResourcesHash: string;
  hotelInfoItemsCount: number;
  venuesCount: number;
  createdAt: string;
};

type CommunicationsProjection = {
  projectionRunId: string;
  status: "completed";
  communicationsHash: string;
  departmentsCount: number;
  configuredDepartmentsCount: number;
  phoneChannelsCount: number;
  whatsappChannelsCount: number;
  emailChannelsCount: number;
  createdAt: string;
};

export type FactoryRunProgress = Omit<
  FactoryRunSummary,
  "coreCompleted" | "operationalCompleted" | "envelopeCompleted" | "nativeContentCompleted" | "currentStage"
> & {
  blueprint: Record<string, unknown>;
  foundation: {
    status: "completed";
    productionRevisionId: string;
    sandboxRevisionId: string;
    completedAt: string;
  };
  core: (ProjectionBase & {
    roomsCount: number;
    activeRoomsCount: number;
    departmentsCount: number;
    activeDepartmentsCount: number;
  }) | null;
  operational: (ProjectionBase & {
    servicesCount: number;
    workflowsCount: number;
    integrationsCount: number;
    routingRulesCount: number;
  }) | null;
  envelope: (ProjectionBase & {
    roleTemplatesCount: number;
  }) | null;
  native: NativeProjection | null;
  communications: CommunicationsProjection | null;
  nextStage: "core" | "operational" | "envelope" | "native_content" | "communications" | "sandbox_certification";
};

async function readFactoryProgress(
  onboardingRunId: string | null,
  limit: number,
): Promise<unknown> {
  const { data, error } = await supabaseAdmin.rpc(
    "get_factory_onboarding_progress_v2",
    {
      p_onboarding_run_id: onboardingRunId,
      p_limit: Math.max(1, Math.min(limit, 100)),
    },
  );

  if (error) {
    throw new Error(`P4_4_FACTORY_PROGRESS_READ_FAILED:${error.message}`);
  }
  return data;
}

export async function listFactoryOnboardingRuns(limit = 50): Promise<FactoryRunSummary[]> {
  const data = await readFactoryProgress(null, limit);
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const runs = (data as { runs?: unknown }).runs;
  return Array.isArray(runs) ? (runs as FactoryRunSummary[]) : [];
}

export async function getFactoryOnboardingProgress(
  onboardingRunId: string,
): Promise<FactoryRunProgress | null> {
  const normalized = String(onboardingRunId || "").trim();
  if (!UUID_PATTERN.test(normalized)) return null;
  const data = await readFactoryProgress(normalized, 1);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const base = data as Omit<FactoryRunProgress, "communications" | "nextStage"> & {
    nextStage: "core" | "operational" | "envelope" | "native_content" | "sandbox_certification";
  };
  let communications: CommunicationsProjection | null = null;

  if (base.operational?.projectionRunId) {
    const { data: row, error } = await supabaseAdmin
      .from("factory_communications_projection_runs")
      .select(
        "id,communications_hash,departments_count,configured_departments_count,phone_channels_count,whatsapp_channels_count,email_channels_count,status,created_at",
      )
      .eq("operational_projection_run_id", base.operational.projectionRunId)
      .maybeSingle();

    if (error) {
      throw new Error(`P2D_COMMUNICATION_PROGRESS_READ_FAILED:${error.message}`);
    }

    if (row) {
      communications = {
        projectionRunId: row.id,
        status: "completed",
        communicationsHash: row.communications_hash,
        departmentsCount: row.departments_count,
        configuredDepartmentsCount: row.configured_departments_count,
        phoneChannelsCount: row.phone_channels_count,
        whatsappChannelsCount: row.whatsapp_channels_count,
        emailChannelsCount: row.email_channels_count,
        createdAt: row.created_at,
      };
    }
  }

  return {
    ...base,
    communications,
    nextStage: base.native
      ? communications
        ? "sandbox_certification"
        : "communications"
      : base.nextStage,
  };
}
