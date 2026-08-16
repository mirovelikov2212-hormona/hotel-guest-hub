import "server-only";

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

export type ControlPlaneProperty = {
  id: string;
  organizationId: string;
  propertyKey: string;
  displayName: string;
  countryCode: string | null;
  lifecycleState: "draft" | "pilot" | "active" | "suspended" | "archived";
  environments: ControlPlaneEnvironment[];
};

export type ControlPlaneRegistrySnapshot = {
  organizations: ControlPlaneOrganization[];
  properties: ControlPlaneProperty[];
  propertyCount: number;
  environmentCount: number;
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

/**
 * Platform-authority registry read. This intentionally spans tenants and must
 * only be called after a separate Control Plane administrator authorization.
 */
export async function getControlPlaneRegistrySnapshot(): Promise<ControlPlaneRegistrySnapshot> {
  const [organizationsResult, propertiesResult, environmentsResult, hotelsResult] = await Promise.all([
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
  ]);

  const failure = [organizationsResult, propertiesResult, environmentsResult, hotelsResult]
    .find((result) => result.error)?.error;
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
  const hotelsById = new Map(hotelRows.map((row) => [row.id, row]));

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

  const properties = ((propertiesResult.data || []) as PropertyRow[]).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    propertyKey: row.property_key,
    displayName: row.display_name,
    countryCode: row.country_code,
    lifecycleState: row.lifecycle_state,
    environments: environmentsByProperty.get(row.id) || [],
  }));

  return {
    organizations,
    properties,
    propertyCount: properties.length,
    environmentCount: environmentRows.length,
    generatedAt: new Date().toISOString(),
  };
}
