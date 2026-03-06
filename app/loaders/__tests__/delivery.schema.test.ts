import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  submitChangeRequestSchema,
  updateDeliveryDateSchema,
  approveRequestSchema,
  rejectRequestSchema,
} from "~/loaders/delivery.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ─────────────────────────────────────────────────────────────
// submitChangeRequestSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("submitChangeRequestSchema", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("_action과 미래 날짜(2026-03-07)를 허용한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
      requested_date: "2026-03-07",
    });
    expect(result.success).toBe(true);
  });

  it("오늘 날짜(2026-03-06)는 실패한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
      requested_date: "2026-03-06",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "희망 배송일은 오늘 이후 날짜여야 합니다."
      );
    }
  });

  it("과거 날짜(2026-03-05)는 실패한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
      requested_date: "2026-03-05",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "희망 배송일은 오늘 이후 날짜여야 합니다."
      );
    }
  });

  it("requested_date 빈 문자열은 실패한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
      requested_date: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("희망 배송일을 선택해주세요.");
    }
  });

  it("requested_date 없으면 실패한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
    });
    expect(result.success).toBe(false);
  });

  it("reason 500자 이내를 허용한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
      requested_date: "2026-03-07",
      reason: "A".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("reason 501자는 실패한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
      requested_date: "2026-03-07",
      reason: "A".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("사유는 500자 이하로 입력해주세요.");
    }
  });

  it("reason 없어도 허용한다 (optional)", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "submit_change_request",
      requested_date: "2026-03-10",
    });
    expect(result.success).toBe(true);
  });

  it("_action이 다른 값이면 실패한다", () => {
    const result = submitChangeRequestSchema.safeParse({
      _action: "approve_request",
      requested_date: "2026-03-07",
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// approveRequestSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("approveRequestSchema", () => {
  it("_action과 유효한 request_id UUID를 허용한다", () => {
    const result = approveRequestSchema.safeParse({
      _action: "approve_request",
      request_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("request_id가 UUID가 아니면 실패한다", () => {
    const result = approveRequestSchema.safeParse({
      _action: "approve_request",
      request_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 요청 ID가 필요합니다.");
    }
  });

  it("request_id 없으면 실패한다", () => {
    const result = approveRequestSchema.safeParse({
      _action: "approve_request",
    });
    expect(result.success).toBe(false);
  });

  it("_action이 다른 값이면 실패한다", () => {
    const result = approveRequestSchema.safeParse({
      _action: "reject_request",
      request_id: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// rejectRequestSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("rejectRequestSchema", () => {
  it("_action, 유효한 request_id, response_text가 있으면 허용한다", () => {
    const result = rejectRequestSchema.safeParse({
      _action: "reject_request",
      request_id: VALID_UUID,
      response_text: "배송 일정 조정이 불가합니다.",
    });
    expect(result.success).toBe(true);
  });

  it("response_text 빈 문자열은 실패한다", () => {
    const result = rejectRequestSchema.safeParse({
      _action: "reject_request",
      request_id: VALID_UUID,
      response_text: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("반려 사유를 입력해주세요.");
    }
  });

  it("response_text 없으면 실패한다", () => {
    const result = rejectRequestSchema.safeParse({
      _action: "reject_request",
      request_id: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("response_text 500자를 허용한다", () => {
    const result = rejectRequestSchema.safeParse({
      _action: "reject_request",
      request_id: VALID_UUID,
      response_text: "A".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("response_text 501자는 실패한다", () => {
    const result = rejectRequestSchema.safeParse({
      _action: "reject_request",
      request_id: VALID_UUID,
      response_text: "A".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("반려 사유는 500자 이하로 입력해주세요.");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// updateDeliveryDateSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("updateDeliveryDateSchema", () => {
  it("_action과 유효한 delivery_date를 허용한다", () => {
    const result = updateDeliveryDateSchema.safeParse({
      _action: "update_delivery_date",
      delivery_date: "2026-03-10",
    });
    expect(result.success).toBe(true);
  });

  it("delivery_date 없어도 허용한다 (optional)", () => {
    const result = updateDeliveryDateSchema.safeParse({
      _action: "update_delivery_date",
    });
    expect(result.success).toBe(true);
  });

  it("_action이 다른 값이면 실패한다", () => {
    const result = updateDeliveryDateSchema.safeParse({
      _action: "submit_change_request",
      delivery_date: "2026-03-10",
    });
    expect(result.success).toBe(false);
  });
});
