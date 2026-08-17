export type PreparedFactoryOperationalResources = {
  blueprint: Record<string, any>;
  blueprintHash: string;
  coreResourcesHash: string;
  operationalResources: {
    schema_version: "p2.3";
    services: Array<Record<string, any>>;
    workflows: Array<Record<string, any>>;
    integrations: Array<Record<string, any>>;
    routing: Array<Record<string, any>>;
  };
  operationalResourcesHash: string;
  counts: {
    services: number;
    workflows: number;
    integrations: number;
    routingRules: number;
    runtimeEnabledServices: 0;
    runtimeEnabledWorkflows: 0;
    activeRoutingRules: 0;
    configuredIntegrations: 0;
  };
};

export function prepareFactoryOperationalResources(input: {
  blueprint: Record<string, any>;
}): PreparedFactoryOperationalResources;
