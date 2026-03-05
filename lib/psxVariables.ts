// Source: C:\Users\levis\Documents\Aerowinx\Developers\Variables.txt
// Only variables used by this EFB PSX integration are listed here.

export type PsxIntVarCode =
  | "Qi123"
  | "Qi132"
  | "Qi174"
  | "Qi179"
  | "Qi180"
  | "Qi181"
  | "Qi191"
  | "Qi220";

export type PsxStringVarCode = "Qs438" | "Qs439";

type PsxIntVarDef = {
  name: string;
  mode: "ECON" | "START";
  min: number;
  max: number;
};

type PsxStringVarDef = {
  name: string;
  mode: "ECON";
  minLen: number;
  maxLen: number;
};

export const PSX_INT_VARS: Record<PsxIntVarCode, PsxIntVarDef> = {
  Qi123: { name: "TrueZfw", mode: "ECON", min: 352739, max: 639340 },
  Qi132: {
    name: "ElecSysBitsMain",
    mode: "ECON",
    min: -2147483648,
    max: 2147483647,
  },
  Qi174: {
    name: "BleedAirBits",
    mode: "ECON",
    min: -2147483648,
    max: 2147483647,
  },
  Qi179: { name: "DoorComBits", mode: "ECON", min: 0, max: 63 },
  Qi180: {
    name: "DoorOpenBits",
    mode: "ECON",
    min: -2147483648,
    max: 2147483647,
  },
  Qi181: {
    name: "DoorManBits",
    mode: "ECON",
    min: -2147483648,
    max: 2147483647,
  },
  Qi191: { name: "Towing", mode: "ECON", min: 100000, max: 299359 },
  Qi220: { name: "Refueling", mode: "ECON", min: 0, max: 1 },
};

export const PSX_STRING_VARS: Record<PsxStringVarCode, PsxStringVarDef> = {
  Qs438: { name: "FuelQty", mode: "ECON", minLen: 10, maxLen: 200 },
  Qs439: { name: "FuelLag", mode: "ECON", minLen: 10, maxLen: 200 },
};

export function isIntInPsxRange(code: PsxIntVarCode, value: number): boolean {
  const def = PSX_INT_VARS[code];
  return Number.isFinite(value) && value >= def.min && value <= def.max;
}

export function psxIntRangeError(code: PsxIntVarCode, value: number): string | null {
  if (isIntInPsxRange(code, value)) return null;
  const def = PSX_INT_VARS[code];
  return `${code} (${def.name}) out of range: ${value}. Allowed ${def.min}..${def.max}.`;
}

export function isStringLenInPsxRange(code: PsxStringVarCode, value: string): boolean {
  const def = PSX_STRING_VARS[code];
  const len = value.length;
  return len >= def.minLen && len <= def.maxLen;
}

export function psxStringLenRangeError(code: PsxStringVarCode, value: string): string | null {
  if (isStringLenInPsxRange(code, value)) return null;
  const def = PSX_STRING_VARS[code];
  return `${code} (${def.name}) payload length out of range: ${value.length}. Allowed ${def.minLen}..${def.maxLen}.`;
}

