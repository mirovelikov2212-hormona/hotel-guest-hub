export type PreparedFactoryOnboardingEnvelope = {
  blueprint: Record<string, any>;
  blueprintHash: string;
  coreResourcesHash: string;
  operationalResourcesHash: string;
  envelope: Record<string, any>;
  envelopeHash: string;
  counts: {
    roleTemplates: number;
    reportingRecipients: number;
    knowledgeFacts: number;
    knowledgePolicies: number;
    enabledAiActions: number;
    reservedPublicIdentities: number;
  };
};

export function prepareFactoryOnboardingEnvelope(input: {
  blueprint: Record<string, any>;
}): PreparedFactoryOnboardingEnvelope;
