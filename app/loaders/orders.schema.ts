import { z } from "zod";

export const createOrderSchema = z.object({
  po_id: z.string().uuid("유효한 PO를 선택하세요"),
  saelim_no: z.string().max(50, "세림번호는 50자 이내로 입력하세요").optional(),
});

export const updateFieldsSchema = z.object({
  saelim_no: z.string().max(50).optional(),
  advice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

const DOC_TYPE_ENUM = ["pi", "shipping", "customs", "delivery"] as const;

export const linkDocumentSchema = z.object({
  doc_type: z.enum(DOC_TYPE_ENUM, { message: "유효한 서류 종류를 선택하세요" }),
  doc_id: z.string().uuid("유효한 서류 ID를 입력하세요"),
});

export const unlinkDocumentSchema = z.object({
  doc_type: z.enum(DOC_TYPE_ENUM, { message: "유효한 서류 종류를 선택하세요" }),
});
