import { z } from "zod";

export const submitChangeRequestSchema = z.object({
  _action: z.literal("submit_change_request"),
  requested_date: z
    .string()
    .min(1, "희망 배송일을 선택해주세요.")
    .refine((val) => {
      // UTC 날짜 문자열 비교 (CF Workers UTC 기준, KST 사용자 호환)
      const todayStr = new Date().toISOString().slice(0, 10);
      return val > todayStr;
    }, "희망 배송일은 오늘 이후 날짜여야 합니다."),
  reason: z.string().max(500, "사유는 500자 이하로 입력해주세요.").optional(),
});

export const updateDeliveryDateSchema = z.object({
  _action: z.literal("update_delivery_date"),
  delivery_date: z.string().optional(),
});

export const approveRequestSchema = z.object({
  _action: z.literal("approve_request"),
  request_id: z.string().uuid("유효한 요청 ID가 필요합니다."),
});

export const rejectRequestSchema = z.object({
  _action: z.literal("reject_request"),
  request_id: z.string().uuid("유효한 요청 ID가 필요합니다."),
  response_text: z
    .string()
    .min(1, "반려 사유를 입력해주세요.")
    .max(500, "반려 사유는 500자 이하로 입력해주세요."),
});
