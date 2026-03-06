import { z } from "zod";
import { lineItemSchema } from "~/loaders/po.schema";

// lineItemSchema는 po.schema에서 재사용 (구조 동일)
export { lineItemSchema };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const piSchema = z.object({
  pi_date: z
    .string()
    .min(1, "PI 일자를 입력하세요")
    .regex(ISO_DATE, "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"),
  validity: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => !v || ISO_DATE.test(v),
      "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
    ),
  ref_no: z.string().max(100).optional().default(""),
  po_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  supplier_id: z.string().uuid("공급업체를 선택하세요"),
  buyer_id: z.string().uuid("구매업체를 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().max(200).optional().default(""),
  delivery_term: z.string().max(200).optional().default(""),
  loading_port: z.string().max(200).optional().default(""),
  discharge_port: z.string().max(200).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});
