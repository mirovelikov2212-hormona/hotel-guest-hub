import "server-only";

import { getEffectiveCommercialAccess, type PropertyCommercialStatus } from "@/lib/server/property-commercial-lifecycle";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type ControlPlaneOrganization = {
  id: string;
  slug: string;
  displayName: string;
  status: "active" | "suspended" | "archived";
};

export type ControlPlaneEnvironment = {
  id: string;
  propertyId: string;
  hotelId: string;
  environment: "production" | "sandbox" | "demo";
  hotelSlug: string;
  publicSlug: string | null;
  hotelName: string;
  timezone: string;
  active: boolean;
};

export type ControlPlaneCommercialState = {
  managed: boolean;
  status: "unmanaged" | PropertyCommercialStatus;
  effectiveStatus:
    | "unmanaged"
    | "pending"
    | "trial_active"
    | "trial_expired"
    | "customer_active"
    | "suspended"
    | "ended";
  accessAllowed: boolean | null;
  planCode: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  contractStartedAt: string | null;
  version: number | null;
};

export type ControlPlaneProperty = {
  id: string;
  organizationId: string;
  propertyKey: string;
  displayName: string;
  countryCode: string | null;
  lifecycleState: "draft" | "pilot" | "active" | "suspended" | "archived";
  commercial: ControlPlaneCommercialState;
  environments: ControlPlaneEnvironment[];
};

export type ControlPlaneRegistrySnapshot = {
  organizations: ControlPlaneOrganization[];
  properties: ControlPlaneProperty[];
  propertyCount: number;
  environmentCount: number;
  commercialManagedCount: number;
  activeTrialCount: number;
  activeCustomerCount: number;
  generatedAt: string;
};

type OrganizationRow = {
  id: string;
  slug: string;
  display_name: string;
  status: ControlPlaneOrganization["status"];
};

type PropertyRow = {
  id: string;
  organization_id: string;
  property_key: string;
  display_name: string;
  country_code: string | null;
  lifecycle_state: ControlPlaneProperty["lifecycleState"];
};

type EnvironmentRow = {
  id: string;
  property_id: string;
  hotel_id: string;
  environment: ControlPlaneEnvironment["environment"];
};

type HotelRow = {
  id: string;
  slug: string;
  public_slug: string | null;
  name: string;
  timezone: string;
  active: boolean;
};

type CommercialRow = {
  property_id: string;
  organization_id: string;
  status: PropertyCommercialStatus;
  plan_code: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  contract_started_at: string | null;
  version: number | string;
};

function unmanagedCommercialState(): ControlPlaneCommercialState {
  return {
    managed: false,
    status: "unmanaged",
    effectiveStatus: "unmanaged",
    accessAllowed: null,
    planCode: null,
    trialStartedAt: null,
    trialEndsAt: null,
    contractStartedAt: null,
    version: null,
  };
}

/**
 * Platform-authority registry read. This intentionally spans tenants and must
 * only be called after a separate Control Plane administrator authorization.
 */
export async function getControlPlaneRegistrySnapshot(): Promise<ControlPlaneRegistrySnapshot> {
  const [
    organizationsResult,
    propertiesResult,
    environmentsResult,
    hotelsResult,
    commercialResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select("id, slug, display_name, status")
      .order("slug", { ascending: true }),
    supabaseAdmin
      .from("properties")
      .select("id, organization_id, property_key, display_name, country_code, lifecycle_state")
      .order("property_key", { ascending: true }),
    supabaseAdmin
      .from("property_environments")
      .select("id, property_id, hotel_id, environment")
      .order("environment", { ascending: true }),
    supabaseAdmin
      .from("hotels")
      .select("id, slug, public_slug, name, timezone, active")
      .order("slug", { ascending: true }),
    supabaseAdmin
      .from("property_commercial_state")
      .select(
        "property_id, organization_id, status, plan_code, trial_started_at, trial_ends_at, contract_started_at, version",
      )
      .order("property_id", { ascending: true }),
  ]);

  const failure = [
    organizationsResult,
    propertiesResult,
    environmentsResult,
    hotelsResult,
    commercialResult,
  ].find((result) => result.error)?.error;

  if (failure) {
    throw new Error(`CONTROL_PLANE_REGISTRY_UNAVAILABLE:${failure.message}`);
  }

  const organizations = ((organizationsResult.data || []) as OrganizationRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    status: row.status,
  }));

  const environmentRows = (environmentsResult.data || []) as EnvironmentRow[];
  const hotelRows = (hotelsResult.data || []) as HotelRow[];
  const commercialRows = (commercialResult.data || []) as CommercialRow[];
  const hotelsById = new Map(hotelRows.map((row) => [row.id, row]));
  const commercialByPropertyId = new Map(commercialRows.map((row) => [row.property_id, row]));

  const environmentsByProperty = new Map<string, ControlPlaneEnvironment[]>();
  for (const row of environmentRows) {
    const hotel = hotelsById.get(row.hotel_id);
    if (!hotel) {
      throw new Error(`CONTROL_PLANE_REGISTRY_ORPHAN_ENVIRONMENT:${row.id}`);
    }

    const environment: ControlPlaneEnvironment = {
      id: row.id,
      propertyId: row.property_id,
      hotelId: row.hotel_id,
      environment: row.environment,
      hotelSlug: hotel.slug,
      publicSlug: hotel.public_slug,
      hotelName: hotel.name,
      timezone: hotel.timezone,
      active: hotel.active,
    };

    environmentsByProperty.set(row.property_id, [
      ...(environmentsByProperty.get(row.property_id) || []),
      environment,
    ]);
  }

  const properties = ((propertiesResult.data || []) as PropertyRow[]).map((row) => {
    const commercialRow = commercialByPropertyId.get(row.id);
    let commercial = unmanagedCommercialState();

    if (commercialRow) {
      if (commercialRow.organization_id !== row.organization_id) {
        throw new Error(`CONTROL_PLANE_REGISTRY_COMMERCIAL_ORG_DRIFT:${row.id}`);
      }
      const effective = getEffectiveCommercialAccess({
        status: commercialRow.status,
        trialEndsAt: commercialRow.trial_ends_at,
      });
      commercial = {
        managed: true,
        status: commercialRow.status,
        effectiveStatus: effective.effectiveStatus,
        accessAllowed: effective.accessAllowed,
        planCode: commercialRow.plan_code,
        trialStartedAt: commercialRow.trial_started_at,
        trialEndsAt: commercialRow.trial_ends_at,
        contractStartedAt: commercialRow.contract_started_at,
        version: Number(commercialRow.version),
      };
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      propertyKey: row.property_key,
      displayName: row.display_name,
      countryCode: row.country_code,
      lifecycleState: row.lifecycle_state,
      commercial,
      environments: environmentsByProperty.get(row.id) || [],
    };
  });

  return {
    organizations,
    properties,
    propertyCount: properties.length,
    environmentCount: environmentRows.length,
    commercialManagedCount: properties.filter((property) => property.commercial.managed).length,
    activeTrialCount: properties.filter(
      (property) => property.commercial.effectiveStatus === "trial_active",
    ).length,
    activeCustomerCount: properties.filter(
      (property) => property.commercial.effectiveStatus === "customer_active",
    ).length,
    generatedAt: new Date().toISOString(),
  };
}
