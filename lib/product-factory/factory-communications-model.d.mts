export type FactoryDepartmentCommunication = {
  department_code: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
};

export type PreparedFactoryCommunications = {
  blueprint: Record<string, unknown>;
  blueprintHash: string;
  communications: {
    schema_version: "step2d-communications-v1";
    department_contacts: FactoryDepartmentCommunication[];
  };
  communicationsHash: string;
  counts: {
    departments: number;
    configuredDepartments: number;
    phoneChannels: number;
    whatsappChannels: number;
    emailChannels: number;
  };
};

export function prepareFactoryCommunications(input: {
  blueprint: Record<string, unknown>;
}): PreparedFactoryCommunications;

export const FACTORY_COMMUNICATIONS_SCHEMA_VERSION: "step2d-communications-v1";
