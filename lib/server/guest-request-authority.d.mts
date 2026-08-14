export type GuestRequestAuthorityDepartment =
  | "housekeeping"
  | "maintenance"
  | "reception"
  | "restaurant";

export type GuestRequestAuthorityRequestDef = {
  id?: string;
  type?: string;
  enabled?: boolean;
  guestVisible?: boolean;
  requestKind?: string;
  targetDepartment?: string;
  afterHoursDepartment?: string;
  notifyDepartments?: string[];
  requestType?: string;
  requiresBilling?: boolean;
  requiresQuantity?: boolean;
  minQty?: number;
  maxQty?: number;
  price?: string;
  currency?: string;
  canonicalRef?: string;
};

export type GuestRequestAuthorityResult =
  | {
      ok: true;
      requestType: string;
      department: GuestRequestAuthorityDepartment | null;
      afterHoursDepartment?: GuestRequestAuthorityDepartment;
      notifyDepartments: string[];
      requiresBilling: boolean;
      price: string | null;
      currency: string | null;
      sourceRequestDef: string | null;
      quantity: number | null;
    }
  | {
      ok: false;
      code:
        | "REQUEST_DEF_NOT_FOUND"
        | "REQUEST_TYPE_MISMATCH"
        | "REQUEST_QUANTITY_INVALID";
      message: string;
    };

export function resolveGuestRequestAuthority(input: {
  requestDefs?: GuestRequestAuthorityRequestDef[] | null;
  rawType: unknown;
  sourceRequestDef?: unknown;
  note?: unknown;
}): GuestRequestAuthorityResult;
