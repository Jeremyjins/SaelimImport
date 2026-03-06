export const CURRENCIES = ["USD", "KRW"] as const;

export const LOADING_PORTS = ["Keelung, Taiwan", "Kaohsiung, Taiwan"] as const;

export const DISCHARGE_PORTS = ["Busan, Korea", "Incheon, Korea"] as const;

export const PAYMENT_TERMS = [
  "T/T in advance",
  "T/T 30 days",
  "L/C at sight",
] as const;

export const DELIVERY_TERMS = [
  "CFR Busan",
  "CIF Busan",
  "FOB Keelung",
] as const;

export const DOC_STATUS = {
  PROCESS: "process",
  COMPLETE: "complete",
} as const;

export const ORG_TYPES = {
  GV: "gv",
  SAELIM: "saelim",
} as const;
