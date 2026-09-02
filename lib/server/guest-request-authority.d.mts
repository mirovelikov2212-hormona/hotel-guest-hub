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
  staffLabel?: Partial<Record<"bg" | "en" | "de", string>>;
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
      staffLabels?: {
        bg: string | null;
        en: string | null;
        de: string | null;
      };
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
  strictConfiguredRequests?: boolean;
  rawType: unknown;
  sourceRequestDef?: unknown;
  note?: unknown;
}): GuestRequestAuthorityResult;
