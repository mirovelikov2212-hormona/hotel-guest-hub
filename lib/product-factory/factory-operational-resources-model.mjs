import crypto from "node:crypto";

import { prepareFactoryCoreResources } from "./factory-core-resources-model.mjs";
import { stableFactoryJson } from "./factory-onboarding-model.mjs";

const RESOURCE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const SERVICE_MODES = new Set(["core", "configurable", "custom"]);
const WORKFLOW_ACTIONS = new Set([
  "assign",
  "condition",
  "approval",
  "wait",
  "billing",
  "notification",
  "escalation",
  "integration_action",
  "complete",
]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function hashValue(value) {
  return crypto.createHash("sha256").update(stableFactoryJson(value)).digest("hex");
}

function normalizeKey(value, field) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!RESOURCE_KEY_PATTERN.test(normalized)) {
    throw new Error(`P2_3_INVALID_KEY:${field}`);
  }
  return normalized;
}

function normalizeLabel(value, fallback, field) {
  const normalized = String(value || fallback || "").trim();
  if (!normalized || normalized.length > 160) {
    throw new Error(`P2_3_INVALID_LABEL:${field}`);
  }
  return normalized;
}

function assertUnique(items, field) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.key)) throw new Error(`P2_3_DUPLICATE:${field}:${item.key}`);
    seen.add(item.key);
  }
}

function jsonClone(value) {
  return JSON.parse(stableFactoryJson(value));
}

export function prepareFactoryOperationalResources({ blueprint }) {
  const core = prepareFactoryCoreResources({ blueprint });
  const normalizedBlueprint = core.blueprint;

  const departmentsByCode = new Map(
    core.coreResources.departments.map((department) => [department.code, department]),
  );

  const integrations = normalizedBlueprint.integrations.map((integration, index) => {
    const key = normalizeKey(integration.id, `integrations.${index}.id`);
    const kind = normalizeKey(integration.kind, `integrations.${index}.kind`);
    const adapterKey = normalizeKey(
      integration.adapterKey,
      `integrations.${index}.adapterKey`,
    );

    return {
      key,
      kind,
      adapter_key: adapterKey,
      status: "placeholder",
      config_json: jsonClone(integration),
    };
  });
  assertUnique(integrations, "integration");
  const integrationKeys = new Set(integrations.map((integration) => integration.key));

  const workflows = normalizedBlueprint.workflows.map((workflow, index) => {
    const key = normalizeKey(workflow.id, `workflows.${index}.id`);
    const trigger = normalizeKey(
      workflow.trigger || "service_request",
      `workflows.${index}.trigger`,
    );
    const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
    if (!steps.length) throw new Error(`P2_3_WORKFLOW_STEPS_REQUIRED:${key}`);

    const normalizedSteps = steps.map((step, stepIndex) => {
      const action = normalizeKey(
        step.action,
        `workflows.${index}.steps.${stepIndex}.action`,
      );
      if (!WORKFLOW_ACTIONS.has(action)) {
        throw new Error(`P2_3_UNKNOWN_WORKFLOW_ACTION:${key}:${action}`);
      }

      const departmentCode = step.departmentId
        ? normalizeKey(
            step.departmentId,
            `workflows.${index}.steps.${stepIndex}.departmentId`,
          )
        : null;
      if (departmentCode && !departmentsByCode.has(departmentCode)) {
        throw new Error(`P2_3_UNKNOWN_DEPARTMENT:${key}:${departmentCode}`);
      }

      const integrationKey = step.integrationId
        ? normalizeKey(
            step.integrationId,
            `workflows.${index}.steps.${stepIndex}.integrationId`,
          )
        : null;
      if (integrationKey && !integrationKeys.has(integrationKey)) {
        throw new Error(`P2_3_UNKNOWN_INTEGRATION:${key}:${integrationKey}`);
      }

      return {
        sequence: stepIndex + 1,
        action,
        department_code: departmentCode,
        integration_key: integrationKey,
        config_json: jsonClone(step),
      };
    });

    return {
      key,
      trigger,
      runtime_enabled: false,
      definition_json: {
        id: key,
        trigger,
        steps: normalizedSteps,
      },
    };
  });
  assertUnique(workflows, "workflow");
  const workflowKeys = new Set(workflows.map((workflow) => workflow.key));

  const services = normalizedBlueprint.services.map((service, index) => {
    const key = normalizeKey(service.id, `services.${index}.id`);
    const mode = String(service.mode || "").trim().toLowerCase();
    if (!SERVICE_MODES.has(mode)) {
      throw new Error(`P2_3_INVALID_SERVICE_MODE:${key}:${mode}`);
    }

    const departmentCode = service.departmentId
      ? normalizeKey(service.departmentId, `services.${index}.departmentId`)
      : null;
    if (departmentCode && !departmentsByCode.has(departmentCode)) {
      throw new Error(`P2_3_UNKNOWN_DEPARTMENT:${key}:${departmentCode}`);
    }

    const workflowKey = service.workflowId
      ? normalizeKey(service.workflowId, `services.${index}.workflowId`)
      : null;
    if (workflowKey && !workflowKeys.has(workflowKey)) {
      throw new Error(`P2_3_UNKNOWN_WORKFLOW:${key}:${workflowKey}`);
    }

    const integrationKey = service.integrationId
      ? normalizeKey(service.integrationId, `services.${index}.integrationId`)
      : null;
    if (integrationKey && !integrationKeys.has(integrationKey)) {
      throw new Error(`P2_3_UNKNOWN_INTEGRATION:${key}:${integrationKey}`);
    }

    const priority = String(service.priorityDefault || "normal").trim().toLowerCase();
    if (!PRIORITIES.has(priority)) {
      throw new Error(`P2_3_INVALID_PRIORITY:${key}:${priority}`);
    }

    return {
      key,
      label: normalizeLabel(service.name, key, `services.${index}.name`),
      mode,
      department_code: departmentCode,
      workflow_key: workflowKey,
      integration_key: integrationKey,
      priority_default: priority,
      runtime_enabled: false,
      definition_json: jsonClone(service),
    };
  });
  assertUnique(services, "service");

  const routing = services
    .filter((service) => service.department_code)
    .map((service) => {
      const department = departmentsByCode.get(service.department_code);
      return {
        request_type: service.key,
        department_code: service.department_code,
        after_hours_department_code:
          department?.after_hours_department_code || null,
        priority_default: service.priority_default,
        auto_assign_mode: "none",
        active: false,
      };
    });

  const operationalResources = {
    schema_version: "p2.3",
    services,
    workflows,
    integrations,
    routing,
  };

  return {
    blueprint: normalizedBlueprint,
    blueprintHash: core.blueprintHash,
    coreResourcesHash: core.coreResourcesHash,
    operationalResources,
    operationalResourcesHash: hashValue(operationalResources),
    counts: {
      services: services.length,
      workflows: workflows.length,
      integrations: integrations.length,
      routingRules: routing.length,
      runtimeEnabledServices: 0,
      runtimeEnabledWorkflows: 0,
      activeRoutingRules: 0,
      configuredIntegrations: 0,
    },
  };
}
