import "server-only";

import type { PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { assessFactoryProductionVersionReadiness } from "@/lib/server/factory-production-version-readiness";
import {
  activateFactoryProductionVersionCandidate,
  certifyFactoryProductionVersionCandidate,
  publishFactoryProductionVersionCandidate,
} from "@/lib/server/factory-production-version-transition";
import {
  activateFactoryProductionHistoricalRestore,
  assessFactoryProductionHistoricalRestoreReadiness,
  certifyFactoryProductionHistoricalRestore,
  publishFactoryProductionHistoricalRestore,
} from "@/lib/server/factory-production-version-restore";

export type FactoryVersionManagementAction =
  | "upgrade_readiness"
  | "upgrade_publication"
  | "upgrade_certification"
  | "upgrade_activation"
  | "restore_readiness"
  | "restore_publication"
  | "restore_certification"
  | "restore_activation";

const UPGRADE_READINESS_APPROVAL = {
  assessVersionReadiness: true,
  preserveCurrentLive: true,
  requireImmutableCandidate: true,
  requireRuntimeCertification: true,
  activateImmediately: false,
} as const;

const UPGRADE_PUBLICATION_APPROVAL = {
  publishVersionCandidate: true,
  preserveCurrentLive: true,
  requireRuntimeCertification: true,
  activateImmediately: false,
} as const;

const UPGRADE_CERTIFICATION_APPROVAL = {
  certifyVersionCandidate: true,
  preserveCurrentLive: true,
  validateProjectionDryRun: true,
  requireExactProductionRelease: true,
} as const;

const UPGRADE_ACTIVATION_APPROVAL = {
  activateCertifiedVersion: true,
  expectedCurrentLiveCas: true,
  atomicProjectionCutover: true,
  preserveHotelAvailability: true,
  retainRevisionHistory: true,
} as const;

const RESTORE_READINESS_APPROVAL = {
  restoreHistoricalVersion: true,
  preserveCurrentLive: true,
  requireRuntimeRecertification: true,
  activateImmediately: false,
} as const;

const RESTORE_PUBLICATION_APPROVAL = {
  publishRestoreIntent: true,
  preserveCurrentLive: true,
  requireRuntimeCertification: true,
  activateImmediately: false,
} as const;

const RESTORE_CERTIFICATION_APPROVAL = {
  certifyHistoricalRestore: true,
  preserveCurrentLive: true,
  validateProjectionDryRun: true,
  requireExactProductionRelease: true,
} as const;

const RESTORE_ACTIVATION_APPROVAL = {
  activateHistoricalRestore: true,
  expectedCurrentLiveCas: true,
  atomicProjectionCutover: true,
  preserveHotelAvailability: true,
  retainRevisionHistory: true,
} as const;

export async function runFactoryVersionManagementAction(input: {
  authority: PlatformAdminAuthority;
  action: FactoryVersionManagementAction;
  locator: unknown;
  reason?: unknown;
  confirmed: unknown;
}) {
  if (input.confirmed !== true) throw new Error("CM4_EXPLICIT_CONFIRMATION_REQUIRED");

  switch (input.action) {
    case "upgrade_readiness":
      return assessFactoryProductionVersionReadiness({
        authority: input.authority,
        sourceCandidateRevisionId: input.locator,
        reason: input.reason,
        approval: UPGRADE_READINESS_APPROVAL,
      });
    case "upgrade_publication":
      return publishFactoryProductionVersionCandidate({
        authority: input.authority,
        sourceCandidateRevisionId: input.locator,
        reason: input.reason,
        approval: UPGRADE_PUBLICATION_APPROVAL,
      });
    case "upgrade_certification":
      return certifyFactoryProductionVersionCandidate({
        authority: input.authority,
        publicationRunId: input.locator,
        approval: UPGRADE_CERTIFICATION_APPROVAL,
      });
    case "upgrade_activation":
      return activateFactoryProductionVersionCandidate({
        authority: input.authority,
        runtimeCertificationRunId: input.locator,
        approval: UPGRADE_ACTIVATION_APPROVAL,
      });
    case "restore_readiness":
      return assessFactoryProductionHistoricalRestoreReadiness({
        authority: input.authority,
        targetHistoricalRevisionId: input.locator,
        reason: input.reason,
        approval: RESTORE_READINESS_APPROVAL,
      });
    case "restore_publication":
      return publishFactoryProductionHistoricalRestore({
        authority: input.authority,
        readinessRunId: input.locator,
        approval: RESTORE_PUBLICATION_APPROVAL,
      });
    case "restore_certification":
      return certifyFactoryProductionHistoricalRestore({
        authority: input.authority,
        publicationRunId: input.locator,
        approval: RESTORE_CERTIFICATION_APPROVAL,
      });
    case "restore_activation":
      return activateFactoryProductionHistoricalRestore({
        authority: input.authority,
        runtimeCertificationRunId: input.locator,
        approval: RESTORE_ACTIVATION_APPROVAL,
      });
    default: {
      const exhaustive: never = input.action;
      throw new Error(`CM4_ACTION_INVALID:${exhaustive}`);
    }
  }
}
