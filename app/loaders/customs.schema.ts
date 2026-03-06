import { z } from "zod";

const MAX_FEE = 999_000_000;

// flat FormData fee 필드 (FormData → flat keys → 서버에서 JSONB 변환)
const feeFlatFields = {
  transport_supply: z.coerce.number().min(0).max(MAX_FEE).default(0),
  transport_vat: z.coerce.number().min(0).max(MAX_FEE).default(0),
  customs_supply: z.coerce.number().min(0).max(MAX_FEE).default(0),
  customs_vat: z.coerce.number().min(0).max(MAX_FEE).default(0),
  vat_supply: z.coerce.number().min(0).max(MAX_FEE).default(0),
  vat_vat: z.coerce.number().min(0).max(MAX_FEE).default(0),
  etc_supply: z.coerce.number().min(0).max(MAX_FEE).default(0),
  etc_vat: z.coerce.number().min(0).max(MAX_FEE).default(0),
};

// create/update 공통 텍스트 필드
const customsTextFields = {
  customs_no: z
    .string()
    .max(50, "통관번호는 50자 이내로 입력하세요")
    .optional(),
  customs_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "유효한 날짜 형식이 아닙니다.")
    .refine((val) => !isNaN(Date.parse(val)), "유효한 날짜가 아닙니다.")
    .optional()
    .or(z.literal("")),
  etc_desc: z
    .string()
    .max(500, "비용 설명은 500자 이내로 입력하세요")
    .optional(),
};

export const customsCreateSchema = z.object({
  shipping_doc_id: z.string().uuid("유효한 선적서류를 선택하세요"),
  ...customsTextFields,
  ...feeFlatFields,
});

export const customsUpdateSchema = z.object({
  ...customsTextFields,
  ...feeFlatFields,
});
