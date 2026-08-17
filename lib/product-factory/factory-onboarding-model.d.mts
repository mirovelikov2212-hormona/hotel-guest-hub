export type PreparedFactoryOnboarding = {
  idempotencyKey: string;
  blueprint: Record<string, unknown>;
  blueprintHash: string;
  identities: {
    organizationSlug: string;
    propertySlug: string;
    publicSlug: string;
    productionSlug: string;
    productionPublicSlug: string;
    sandboxSlug: string;
    sandboxPublicSlug: string;
  };
};

export function stableFactoryJson(value: unknown): string;
export function hashFactoryBlueprint(blueprint: unknown): string;
export function prepareFactoryOnboarding(input: {
  blueprint: Record<string, unknown>;
  idempotencyKey: string;
}): PreparedFactoryOnboarding;
