import { z } from "zod";
import { lineItemSchema } from "~/loaders/po.schema";
import { sanitizeFormulaInjection } from "~/lib/sanitize";

// lineItemSchema는 po.schema에서 재사용 (구조 동일)
export { lineItemSchema };

export const stuffingRollSchema = z.object({
  roll_no: z.coerce.number().int().positive("롤 번호는 양의 정수여야 합니다"),
  product_name: z
    .string()
    .min(1, "품목명은 필수입니다")
    .max(200)
    .transform(sanitizeFormulaInjection),
  gsm: z.coerce.number().positive("GSM은 양수여야 합니다").max(999),
  width_mm: z.coerce.number().positive("폭은 양수여야 합니다").max(9999),
  length_m: z.coerce.number().positive("길이는 양수여야 합니다").max(999999),
  net_weight_kg: z.coerce.number().positive("순중량은 양수여야 합니다").max(99999),
  gross_weight_kg: z.coerce.number().positive("총중량은 양수여야 합니다").max(99999),
});

export const stuffingListSchema = z.object({
  sl_no: z.string().max(50).optional().default("").transform(sanitizeFormulaInjection),
  cntr_no: z.string().max(20).optional().default("").transform(sanitizeFormulaInjection),
  seal_no: z.string().max(50).optional().default("").transform(sanitizeFormulaInjection),
  roll_no_range: z.string().max(50).optional().default(""),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const shippingSchema = z.object({
  ci_date: z
    .string()
    .min(1, "CI 일자를 입력하세요")
    .regex(ISO_DATE, "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  ship_date: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  ref_no: z.string().max(100).optional().default(""),
  pi_id: z.union([z.string().uuid(), z.literal(""), z.literal("__none__")]).optional(),
  shipper_id: z.string().uuid("송하인을 선택하세요"),
  consignee_id: z.string().uuid("수하인을 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().max(200).optional().default(""),
  delivery_term: z.string().max(200).optional().default(""),
  loading_port: z.string().max(200).optional().default(""),
  discharge_port: z.string().max(200).optional().default(""),
  vessel: z.string().max(200).optional().default(""),
  voyage: z.string().max(100).optional().default(""),
  etd: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  eta: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || ISO_DATE.test(v), "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  gross_weight: z.coerce.number().nonnegative().max(9_999_999).optional(),
  net_weight: z.coerce.number().nonnegative().max(9_999_999).optional(),
  package_no: z.coerce.number().int().nonnegative().max(99999).optional(),
  notes: z.string().max(2000).optional().default(""),
});
