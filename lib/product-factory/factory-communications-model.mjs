import crypto from "node:crypto";

import {
  prepareFactoryOnboarding,
  stableFactoryJson,
} from "./factory-onboarding-model.mjs";

const COMMUNICATIONS_SCHEMA_VERSION = "step2d-communications-v1";
const MAX_PHONE_LENGTH = 160;
const MAX_EMAIL_LENGTH = 320;

function hashValue(value) {
  return crypto.createHash("sha256").update(stableFactoryJson(value)).digest("hex");
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalText(value, maxLength, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new Error(`P2D_COMMUNICATION_INVALID:${field}`);
  }
  return normalized;
}

function optionalEmail(value, field) {
  const normalized = optionalText(value, MAX_EMAIL_LENGTH, field);
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`P2D_COMMUNICATION_INVALID:${field}`);
  }
  return normalized;
}

function normalizeDepartmentContact(department, index) {
  const contact = isObject(department?.contact) ? department.contact : {};
  const departmentCode = String(department?.id || "").trim().toLowerCase();
  if (!departmentCode) {
    throw new Error(`P2D_COMMUNICATION_INVALID:departments.${index}.id`);
  }

  return {
    department_code: departmentCode,
    phone: optionalText(contact.phone ?? department.phone, MAX_PHONE_LENGTH, `${departmentCode}.phone`),
    whatsapp: optionalText(
      contact.whatsapp ?? department.whatsapp,
      MAX_PHONE_LENGTH,
      `${departmentCode}.whatsapp`,
    ),
    email: optionalEmail(contact.email ?? department.email, `${departmentCode}.email`),
  };
}

export function prepareFactoryCommunications({ blueprint }) {
  const prepared = prepareFactoryOnboarding({
    blueprint,
    idempotencyKey: "step2d:communications:prepare",
  });
  const normalizedBlueprint = prepared.blueprint;
  const departmentContacts = normalizedBlueprint.departments.map((department, index) =>
    normalizeDepartmentContact(department, index),
  );

  const communications = {
    schema_version: COMMUNICATIONS_SCHEMA_VERSION,
    department_contacts: departmentContacts,
  };

  return {
    blueprint: normalizedBlueprint,
    blueprintHash: prepared.blueprintHash,
    communications,
    communicationsHash: hashValue(communications),
    counts: {
      departments: departmentContacts.length,
      configuredDepartments: departmentContacts.filter(
        (contact) => contact.phone || contact.whatsapp || contact.email,
      ).length,
      phoneChannels: departmentContacts.filter((contact) => contact.phone).length,
      whatsappChannels: departmentContacts.filter((contact) => contact.whatsapp).length,
      emailChannels: departmentContacts.filter((contact) => contact.email).length,
    },
  };
}

export const FACTORY_COMMUNICATIONS_SCHEMA_VERSION = COMMUNICATIONS_SCHEMA_VERSION;
