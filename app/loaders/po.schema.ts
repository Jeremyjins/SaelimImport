import { z } from "zod";

// ── Shared PO Zod Schemas ──────────────────────────────────
// 두 서버 파일(po.server.ts, po.$id.server.ts)에서 공유하는 스키마

export const lineItemSchema = z.object({
  product_id: z.string().uuid("유효한 제품을 선택하세요"),
  product_name: z.string().min(1).max(200),
  gsm: z.number().nullable(),
  width_mm: z.number().nullable(),
  quantity_kg: z.number().positive("수량은 0보다 커야 합니다"),
  unit_price: z.number().positive("단가는 0보다 커야 합니다"),
  amount: z.number().nonnegative(),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const poSchema = z.object({
  po_date: z
    .string()
    .min(1, "PO 일자를 입력하세요")
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
  supplier_id: z.string().uuid("공급업체를 선택하세요"),
  buyer_id: z.string().uuid("구매업체를 선택하세요"),
  currency: z.enum(["USD", "KRW"]),
  payment_term: z.string().optional().default(""),
  delivery_term: z.string().optional().default(""),
  loading_port: z.string().optional().default(""),
  discharge_port: z.string().optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});
