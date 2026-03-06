import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  syncCustomsFeeToOrder,
  syncDeliveryDateToOrder,
  linkCustomsToOrder,
  linkDeliveryToOrder,
  unlinkCustomsFromOrder,
  unlinkDeliveryFromOrder,
  syncDeliveryDateFromOrder,
  unlinkPOFromOrder,
  unlinkPIFromOrder,
  unlinkShippingFromOrder,
  cascadeLinkFull,
  cascadeLinkPartial,
} from "~/lib/order-sync.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";
import type { OrderDetail } from "~/types/order";

type Supabase = SupabaseClient<Database>;

const TEST_ID = "20000000-0000-0000-0000-000000000001";
const TEST_ID_2 = "20000000-0000-0000-0000-000000000002";
const TEST_ID_3 = "20000000-0000-0000-0000-000000000003";

// ─────────────────────────────────────────────────────────────
// Mock 헬퍼: update().eq().is()... 체인을 지원하는 Supabase 팩토리
// ─────────────────────────────────────────────────────────────

function createUpdateChain(resolvedValue: { data: unknown; error: unknown }) {
  // 체인 메서드들이 모두 자신을 반환하지만 마지막 await 시 resolvedValue를 반환
  const chain: Record<string, ReturnType<typeof vi.fn>> = {} as Record<
    string,
    ReturnType<typeof vi.fn>
  >;
  const terminal = vi.fn().mockResolvedValue(resolvedValue);

  // is()가 체인의 가장 끝에서 await 됨 (여러 번 체이닝 가능)
  // 체인의 어느 지점에서 await 되든 resolvedValue 반환되도록 모든 메서드를 mockResolvedValue로
  chain.is = vi.fn().mockReturnValue({
    ...chain,
    is: vi.fn().mockReturnValue({
      is: terminal,
      eq: terminal,
      neq: terminal,
      then: resolvedValue instanceof Promise ? undefined : (resolve: (v: unknown) => void) => resolve(resolvedValue),
    }),
    eq: terminal,
    neq: terminal,
    then: (resolve: (v: unknown) => void) => resolve(resolvedValue),
  });
  chain.eq = vi.fn().mockReturnValue({
    is: chain.is,
    eq: terminal,
    neq: terminal,
    then: (resolve: (v: unknown) => void) => resolve(resolvedValue),
  });
  chain.neq = terminal;

  return chain;
}

/**
 * 단순 update 체인: update({ ... }).eq("field", value).is("deleted_at", null) → Promise 반환
 * unlinkPOFromOrder, unlinkPIFromOrder, unlinkShippingFromOrder 패턴
 */
function createSimpleUpdateSupabase(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const is = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ is });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return {
    supabase: { from } as unknown as Supabase,
    mocks: { from, update, eq, is },
  };
}

/**
 * update().eq().is() 체인 Supabase: syncCustomsFeeToOrder, syncDeliveryDateToOrder 등
 * 마지막 is() 호출이 await 됨
 */
function createChainedUpdateSupabase(result = { data: null, error: null }) {
  const isSecond = vi.fn().mockResolvedValue(result);
  const isFirst = vi.fn().mockReturnValue({ is: isSecond });
  const eq = vi.fn().mockReturnValue({ is: isFirst });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return {
    supabase: { from } as unknown as Supabase,
    mocks: { from, update, eq, isFirst, isSecond },
  };
}

/**
 * syncCustomsFeeToOrder / syncDeliveryDateToOrder:
 * update().eq("field", id).is("deleted_at", null) 패턴
 * is()가 단 1회만 호출됨
 */
function createSingleIsUpdateSupabase(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const is = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ is });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return {
    supabase: { from } as unknown as Supabase,
    mocks: { from, update, eq, is },
  };
}

/**
 * linkCustomsToOrder: update().eq().is("customs_id", null).is("deleted_at", null)
 * is()가 2회 호출됨
 */
function createDoubleIsUpdateSupabase(result = { data: null, error: null }) {
  const isSecond = vi.fn().mockResolvedValue(result);
  const isFirst = vi.fn().mockReturnValue({ is: isSecond });
  const eq = vi.fn().mockReturnValue({ is: isFirst });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return {
    supabase: { from } as unknown as Supabase,
    mocks: { from, update, eq, isFirst, isSecond },
  };
}

/**
 * syncDeliveryDateFromOrder: update().eq().neq().is() 패턴
 */
function createNeqIsUpdateSupabase(result = { data: null, error: null }) {
  const is = vi.fn().mockResolvedValue(result);
  const neq = vi.fn().mockReturnValue({ is });
  const eq = vi.fn().mockReturnValue({ neq });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return {
    supabase: { from } as unknown as Supabase,
    mocks: { from, update, eq, neq, is },
  };
}

/**
 * cascadeLinkFull 테스트용: select().eq().is().order().limit() 체인 반환
 */
function createSelectChain(data: unknown[]) {
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const is = vi.fn().mockReturnValue({ order, limit });
  const eq = vi.fn().mockReturnValue({ is });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, is, order, limit };
}

// ─────────────────────────────────────────────────────────────
// unlinkPOFromOrder
// ─────────────────────────────────────────────────────────────
describe("unlinkPOFromOrder", () => {
  it("orders 테이블에 po_id=null 업데이트 쿼리를 실행한다", async () => {
    const { supabase, mocks } = createSimpleUpdateSupabase();

    await unlinkPOFromOrder(supabase, TEST_ID);

    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ po_id: null })
    );
    expect(mocks.eq).toHaveBeenCalledWith("po_id", TEST_ID);
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("Supabase 에러 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const { supabase } = createSimpleUpdateSupabase({
      data: null,
      error: new Error("DB 연결 오류"),
    });

    await expect(unlinkPOFromOrder(supabase, TEST_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// unlinkPIFromOrder
// ─────────────────────────────────────────────────────────────
describe("unlinkPIFromOrder", () => {
  it("orders 테이블에 pi_id=null 업데이트 쿼리를 실행한다", async () => {
    const { supabase, mocks } = createSimpleUpdateSupabase();

    await unlinkPIFromOrder(supabase, TEST_ID);

    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ pi_id: null })
    );
    expect(mocks.eq).toHaveBeenCalledWith("pi_id", TEST_ID);
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("Supabase 에러 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const { supabase } = createSimpleUpdateSupabase({
      data: null,
      error: new Error("DB 연결 오류"),
    });

    await expect(unlinkPIFromOrder(supabase, TEST_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// unlinkShippingFromOrder
// ─────────────────────────────────────────────────────────────
describe("unlinkShippingFromOrder", () => {
  it("orders 테이블에 shipping_doc_id=null 업데이트 쿼리를 실행한다", async () => {
    const { supabase, mocks } = createSimpleUpdateSupabase();

    await unlinkShippingFromOrder(supabase, TEST_ID);

    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ shipping_doc_id: null })
    );
    expect(mocks.eq).toHaveBeenCalledWith("shipping_doc_id", TEST_ID);
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("Supabase 에러 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const { supabase } = createSimpleUpdateSupabase({
      data: null,
      error: new Error("DB 연결 오류"),
    });

    await expect(
      unlinkShippingFromOrder(supabase, TEST_ID)
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// syncCustomsFeeToOrder
// ─────────────────────────────────────────────────────────────
describe("syncCustomsFeeToOrder", () => {
  it("orders 테이블에 customs_fee_received 값을 업데이트한다", async () => {
    const { supabase, mocks } = createSingleIsUpdateSupabase();

    await syncCustomsFeeToOrder(supabase, TEST_ID, true);

    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ customs_fee_received: true })
    );
    expect(mocks.eq).toHaveBeenCalledWith("customs_id", TEST_ID);
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("false 값도 올바르게 동기화한다", async () => {
    const { supabase, mocks } = createSingleIsUpdateSupabase();

    await syncCustomsFeeToOrder(supabase, TEST_ID, false);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ customs_fee_received: false })
    );
  });

  it("예외 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const from = vi.fn().mockImplementation(() => {
      throw new Error("네트워크 오류");
    });
    const supabase = { from } as unknown as Supabase;

    await expect(
      syncCustomsFeeToOrder(supabase, TEST_ID, true)
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// syncDeliveryDateToOrder
// ─────────────────────────────────────────────────────────────
describe("syncDeliveryDateToOrder", () => {
  it("orders 테이블에 delivery_date 값을 업데이트한다", async () => {
    const { supabase, mocks } = createSingleIsUpdateSupabase();
    const date = "2026-04-01";

    await syncDeliveryDateToOrder(supabase, TEST_ID, date);

    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_date: date })
    );
    expect(mocks.eq).toHaveBeenCalledWith("delivery_id", TEST_ID);
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("null 날짜도 올바르게 동기화한다", async () => {
    const { supabase, mocks } = createSingleIsUpdateSupabase();

    await syncDeliveryDateToOrder(supabase, TEST_ID, null);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_date: null })
    );
  });

  it("예외 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const from = vi.fn().mockImplementation(() => {
      throw new Error("네트워크 오류");
    });
    const supabase = { from } as unknown as Supabase;

    await expect(
      syncDeliveryDateToOrder(supabase, TEST_ID, "2026-04-01")
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// linkCustomsToOrder
// ─────────────────────────────────────────────────────────────
describe("linkCustomsToOrder", () => {
  it("orders 테이블에 customs_id를 연결한다 (shipping_doc_id 기준)", async () => {
    const { supabase, mocks } = createDoubleIsUpdateSupabase();

    await linkCustomsToOrder(supabase, TEST_ID, TEST_ID_2);

    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ customs_id: TEST_ID_2 })
    );
    expect(mocks.eq).toHaveBeenCalledWith("shipping_doc_id", TEST_ID);
    // is("customs_id", null) — 기존 customs 없는 row만 업데이트
    expect(mocks.isFirst).toHaveBeenCalledWith("customs_id", null);
    // is("deleted_at", null) — soft delete 제외
    expect(mocks.isSecond).toHaveBeenCalledWith("deleted_at", null);
  });

  it("예외 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const from = vi.fn().mockImplementation(() => {
      throw new Error("네트워크 오류");
    });
    const supabase = { from } as unknown as Supabase;

    await expect(
      linkCustomsToOrder(supabase, TEST_ID, TEST_ID_2)
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// linkDeliveryToOrder
// ─────────────────────────────────────────────────────────────
describe("linkDeliveryToOrder", () => {
  it("orders 테이블에 delivery_id를 연결한다 (shipping_doc_id 기준)", async () => {
    const { supabase, mocks } = createDoubleIsUpdateSupabase();

    await linkDeliveryToOrder(supabase, TEST_ID, TEST_ID_2);

    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_id: TEST_ID_2 })
    );
    expect(mocks.eq).toHaveBeenCalledWith("shipping_doc_id", TEST_ID);
    // is("delivery_id", null) — 기존 delivery 없는 row만 업데이트
    expect(mocks.isFirst).toHaveBeenCalledWith("delivery_id", null);
    // is("deleted_at", null) — soft delete 제외
    expect(mocks.isSecond).toHaveBeenCalledWith("deleted_at", null);
  });

  it("예외 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const from = vi.fn().mockImplementation(() => {
      throw new Error("네트워크 오류");
    });
    const supabase = { from } as unknown as Supabase;

    await expect(
      linkDeliveryToOrder(supabase, TEST_ID, TEST_ID_2)
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// unlinkCustomsFromOrder (blocking)
// ─────────────────────────────────────────────────────────────
describe("unlinkCustomsFromOrder", () => {
  it("성공 시 true를 반환하고 올바른 쿼리를 실행한다", async () => {
    const { supabase, mocks } = createSingleIsUpdateSupabase({
      data: null,
      error: null,
    });

    const result = await unlinkCustomsFromOrder(supabase, TEST_ID);

    expect(result).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        customs_id: null,
        customs_fee_received: null,
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith("customs_id", TEST_ID);
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("Supabase 에러 발생 시 false를 반환하고 console.error를 호출한다", async () => {
    const { supabase } = createSingleIsUpdateSupabase({
      data: null,
      error: new Error("FK 제약 오류"),
    });

    const result = await unlinkCustomsFromOrder(supabase, TEST_ID);

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("blocking 특성: 에러 시 false를 반환하여 호출자가 처리할 수 있다", async () => {
    const { supabase } = createSingleIsUpdateSupabase({
      data: null,
      error: new Error("트랜잭션 오류"),
    });

    const canDelete = await unlinkCustomsFromOrder(supabase, TEST_ID);
    // 호출자는 false를 받아 삭제를 중단해야 함
    expect(canDelete).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// unlinkDeliveryFromOrder (blocking)
// ─────────────────────────────────────────────────────────────
describe("unlinkDeliveryFromOrder", () => {
  it("성공 시 true를 반환하고 올바른 쿼리를 실행한다", async () => {
    const { supabase, mocks } = createSingleIsUpdateSupabase({
      data: null,
      error: null,
    });

    const result = await unlinkDeliveryFromOrder(supabase, TEST_ID);

    expect(result).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_id: null,
        delivery_date: null,
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith("delivery_id", TEST_ID);
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("Supabase 에러 발생 시 false를 반환하고 console.error를 호출한다", async () => {
    const { supabase } = createSingleIsUpdateSupabase({
      data: null,
      error: new Error("FK 제약 오류"),
    });

    const result = await unlinkDeliveryFromOrder(supabase, TEST_ID);

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("blocking 특성: 에러 시 false를 반환하여 호출자가 처리할 수 있다", async () => {
    const { supabase } = createSingleIsUpdateSupabase({
      data: null,
      error: new Error("트랜잭션 오류"),
    });

    const canDelete = await unlinkDeliveryFromOrder(supabase, TEST_ID);
    expect(canDelete).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// syncDeliveryDateFromOrder
// ─────────────────────────────────────────────────────────────
describe("syncDeliveryDateFromOrder", () => {
  it("날짜가 있으면 deliveries를 scheduled 상태로 업데이트한다", async () => {
    const { supabase, mocks } = createNeqIsUpdateSupabase();
    const date = "2026-04-15";

    await syncDeliveryDateFromOrder(supabase, TEST_ID, date);

    expect(mocks.from).toHaveBeenCalledWith("deliveries");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_date: date,
        status: "scheduled",
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith("id", TEST_ID);
    expect(mocks.neq).toHaveBeenCalledWith("status", "delivered");
    expect(mocks.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("날짜가 null이면 deliveries를 pending 상태로 업데이트한다", async () => {
    const { supabase, mocks } = createNeqIsUpdateSupabase();

    await syncDeliveryDateFromOrder(supabase, TEST_ID, null);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_date: null,
        status: "pending",
      })
    );
  });

  it("delivered 상태인 delivery는 neq 필터로 업데이트에서 제외된다", async () => {
    const { supabase, mocks } = createNeqIsUpdateSupabase();

    await syncDeliveryDateFromOrder(supabase, TEST_ID, "2026-04-15");

    // neq("status", "delivered") 필터가 반드시 호출되어야 함
    expect(mocks.neq).toHaveBeenCalledWith("status", "delivered");
  });

  it("예외 발생 시 console.error를 호출하고 throw하지 않는다", async () => {
    const from = vi.fn().mockImplementation(() => {
      throw new Error("네트워크 오류");
    });
    const supabase = { from } as unknown as Supabase;

    await expect(
      syncDeliveryDateFromOrder(supabase, TEST_ID, "2026-04-15")
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// cascadeLinkFull
// ─────────────────────────────────────────────────────────────
describe("cascadeLinkFull", () => {
  it("PI가 정확히 1개일 때 pi_id를 포함한 결과를 반환한다", async () => {
    // PI: 1개 반환 → piId 설정
    // Shipping: 0개 반환 → shippingDocId null
    // Delivery: 0개 반환 → deliveryId null
    const limitPi = vi.fn().mockResolvedValue({
      data: [{ id: TEST_ID_2 }],
      error: null,
    });
    const orderPi = vi.fn().mockReturnValue({ limit: limitPi });
    const isPi = vi.fn().mockReturnValue({ order: orderPi });
    const eqPi = vi.fn().mockReturnValue({ is: isPi });
    const selectPi = vi.fn().mockReturnValue({ eq: eqPi });

    // Shipping: 0개
    const limitShipping = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderShipping = vi.fn().mockReturnValue({ limit: limitShipping });
    const isShipping = vi.fn().mockReturnValue({ order: orderShipping, limit: limitShipping });
    const eqShipping = vi.fn().mockReturnValue({ is: isShipping });
    const selectShipping = vi.fn().mockReturnValue({ eq: eqShipping });

    // Delivery: 0개
    const limitDelivery = vi.fn().mockResolvedValue({ data: [], error: null });
    const isDelivery = vi.fn().mockReturnValue({ limit: limitDelivery });
    const eqDelivery = vi.fn().mockReturnValue({ is: isDelivery });
    const selectDelivery = vi.fn().mockReturnValue({ eq: eqDelivery });

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: selectPi }) // proforma_invoices
      .mockReturnValueOnce({ select: selectShipping }) // shipping_documents
      .mockReturnValueOnce({ select: selectDelivery }); // deliveries

    const supabase = { from } as unknown as Supabase;
    const result = await cascadeLinkFull(supabase, TEST_ID);

    expect(result.pi_id).toBe(TEST_ID_2);
    expect(result.shipping_doc_id).toBeNull();
    expect(result.delivery_id).toBeNull();
    expect(result.customs_id).toBeNull();
  });

  it("PI가 0개이면 모든 FK가 null인 결과를 즉시 반환한다", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as unknown as Supabase;
    const result = await cascadeLinkFull(supabase, TEST_ID);

    expect(result).toEqual({
      pi_id: null,
      shipping_doc_id: null,
      delivery_id: null,
      customs_id: null,
    });
  });

  it("PI가 2개이면 Exactly-1 Rule에 의해 pi_id가 null을 반환한다", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: TEST_ID_2 }, { id: TEST_ID_3 }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as unknown as Supabase;
    const result = await cascadeLinkFull(supabase, TEST_ID);

    expect(result.pi_id).toBeNull();
  });

  it("PI→Shipping→Customs 전체 체인이 각 1개씩 있을 때 모든 FK를 반환한다", async () => {
    // PI: 1개
    const limitPi = vi.fn().mockResolvedValue({
      data: [{ id: TEST_ID_2 }],
      error: null,
    });
    const orderPi = vi.fn().mockReturnValue({ limit: limitPi });
    const isPi = vi.fn().mockReturnValue({ order: orderPi });
    const eqPi = vi.fn().mockReturnValue({ is: isPi });
    const selectPi = vi.fn().mockReturnValue({ eq: eqPi });

    // Shipping: 1개
    const limitShipping = vi.fn().mockResolvedValue({
      data: [{ id: TEST_ID_3 }],
      error: null,
    });
    const orderShipping = vi.fn().mockReturnValue({ limit: limitShipping });
    const isShipping = vi.fn().mockReturnValue({ order: orderShipping, limit: limitShipping });
    const eqShipping = vi.fn().mockReturnValue({ is: isShipping });
    const selectShipping = vi.fn().mockReturnValue({ eq: eqShipping });

    // Delivery: 1개
    const DELIVERY_ID = "20000000-0000-0000-0000-000000000004";
    const limitDelivery = vi.fn().mockResolvedValue({
      data: [{ id: DELIVERY_ID }],
      error: null,
    });
    const isDelivery = vi.fn().mockReturnValue({ limit: limitDelivery });
    const eqDelivery = vi.fn().mockReturnValue({ is: isDelivery });
    const selectDelivery = vi.fn().mockReturnValue({ eq: eqDelivery });

    // Customs: 1개
    const CUSTOMS_ID = "20000000-0000-0000-0000-000000000005";
    const limitCustoms = vi.fn().mockResolvedValue({
      data: [{ id: CUSTOMS_ID }],
      error: null,
    });
    const isCustoms = vi.fn().mockReturnValue({ limit: limitCustoms });
    const eqCustoms = vi.fn().mockReturnValue({ is: isCustoms });
    const selectCustoms = vi.fn().mockReturnValue({ eq: eqCustoms });

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: selectPi }) // proforma_invoices
      .mockReturnValueOnce({ select: selectShipping }) // shipping_documents (병렬)
      .mockReturnValueOnce({ select: selectDelivery }) // deliveries (병렬)
      .mockReturnValueOnce({ select: selectCustoms }); // customs

    const supabase = { from } as unknown as Supabase;
    const result = await cascadeLinkFull(supabase, TEST_ID);

    expect(result.pi_id).toBe(TEST_ID_2);
    expect(result.shipping_doc_id).toBe(TEST_ID_3);
    expect(result.delivery_id).toBe(DELIVERY_ID);
    expect(result.customs_id).toBe(CUSTOMS_ID);
  });
});

// ─────────────────────────────────────────────────────────────
// cascadeLinkPartial
// ─────────────────────────────────────────────────────────────
describe("cascadeLinkPartial", () => {
  const baseOrder: OrderDetail = {
    id: TEST_ID,
    saelim_no: "GV2026001",
    advice_date: null,
    arrival_date: null,
    delivery_date: null,
    customs_fee_received: null,
    status: "process",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    po_id: TEST_ID,
    pi_id: null,
    shipping_doc_id: null,
    customs_id: null,
    delivery_id: null,
    created_by: null,
    po: null,
    pi: null,
    shipping: null,
    customs: null,
    delivery: null,
  };

  it("pi_id가 null이고 PI가 1개이면 pi_id를 업데이트 목록에 포함한다", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: TEST_ID_2 }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ order, limit });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as unknown as Supabase;
    const updates = await cascadeLinkPartial(supabase, {
      ...baseOrder,
      pi_id: null,
    });

    expect(updates.pi_id).toBe(TEST_ID_2);
  });

  it("모든 FK가 이미 채워져 있으면 빈 updates 객체를 반환한다", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as Supabase;

    const filledOrder: OrderDetail = {
      ...baseOrder,
      pi_id: TEST_ID_2,
      shipping_doc_id: TEST_ID_3,
      customs_id: "20000000-0000-0000-0000-000000000004",
      delivery_id: "20000000-0000-0000-0000-000000000005",
    };

    const updates = await cascadeLinkPartial(supabase, filledOrder);

    // 모든 FK가 있으므로 from()이 호출되지 않아야 함
    expect(from).not.toHaveBeenCalled();
    expect(Object.keys(updates)).toHaveLength(0);
  });

  it("po_id가 null이면 PI 조회를 건너뛴다", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as Supabase;

    const updates = await cascadeLinkPartial(supabase, {
      ...baseOrder,
      po_id: null,
      pi_id: null,
    });

    // po_id가 없으면 PI 조회 불가 → from 호출 없음
    expect(from).not.toHaveBeenCalled();
    expect(updates).toEqual({});
  });

  it("PI가 2개이면 Exactly-1 Rule로 pi_id를 포함하지 않는다", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: TEST_ID_2 }, { id: TEST_ID_3 }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as unknown as Supabase;
    const updates = await cascadeLinkPartial(supabase, {
      ...baseOrder,
      pi_id: null,
    });

    expect(updates.pi_id).toBeUndefined();
  });
});
