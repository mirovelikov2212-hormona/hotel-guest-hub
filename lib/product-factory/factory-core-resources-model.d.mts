export type FactoryCoreRoom = {
  room_number: string;
  floor: string | null;
  building: string | null;
  room_type: string | null;
  active: boolean;
};

export type FactoryCoreDepartment = {
  code: string;
  name: string;
  whatsapp_number: string | null;
  email: string | null;
  opens_at: string | null;
  closes_at: string | null;
  is_24h: boolean;
  active: boolean;
  after_hours_department_code: string | null;
};

export type PreparedFactoryCoreResources = {
  blueprint: Record<string, any>;
  blueprintHash: string;
  coreResources: {
    schema_version: "p2.2";
    rooms: FactoryCoreRoom[];
    departments: FactoryCoreDepartment[];
  };
  coreResourcesHash: string;
  counts: {
    rooms: number;
    activeRooms: number;
    departments: number;
    activeDepartments: number;
  };
};

export function prepareFactoryCoreResources(input: {
  blueprint: Record<string, any>;
}): PreparedFactoryCoreResources;
