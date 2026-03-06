export type OrgType = "gv" | "saelim" | "supplier";

export type DocStatus = "process" | "complete";

export type Currency = "USD" | "KRW";

export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}
