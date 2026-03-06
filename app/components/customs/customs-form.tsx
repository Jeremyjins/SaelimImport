import { useState } from "react";
import { Form, useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { CustomsFeeInput } from "./customs-fee-input";
import { computeFeeTotal } from "~/lib/customs-utils";
import type { AvailableShipping, FeeBreakdown } from "~/types/customs";

interface CustomsFormProps {
  availableShippings: AvailableShipping[];
  defaultShippingId?: string;
  defaultValues?: {
    customs_no?: string | null;
    customs_date?: string | null;
    etc_desc?: string | null;
    transport_fee?: FeeBreakdown | null;
    customs_fee?: FeeBreakdown | null;
    vat_fee?: FeeBreakdown | null;
    etc_fee?: FeeBreakdown | null;
  };
  error?: string | null;
  isEditing?: boolean;
}

export function CustomsForm({
  availableShippings,
  defaultShippingId,
  defaultValues,
  error,
  isEditing = false,
}: CustomsFormProps) {
  const navigate = useNavigate();

  // 총비용 합계 실시간 계산용 state
  const [feeTotals, setFeeTotals] = useState({
    transport: computeFeeTotal(
      defaultValues?.transport_fee?.supply ?? 0,
      defaultValues?.transport_fee?.vat ?? 0
    ),
    customs: computeFeeTotal(
      defaultValues?.customs_fee?.supply ?? 0,
      defaultValues?.customs_fee?.vat ?? 0
    ),
    vat: computeFeeTotal(
      defaultValues?.vat_fee?.supply ?? 0,
      defaultValues?.vat_fee?.vat ?? 0
    ),
    etc: computeFeeTotal(
      defaultValues?.etc_fee?.supply ?? 0,
      defaultValues?.etc_fee?.vat ?? 0
    ),
  });

  const grandTotal =
    feeTotals.transport + feeTotals.customs + feeTotals.vat + feeTotals.etc;

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="_action" value={isEditing ? "update" : "create"} />

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 2열 그리드: 기본정보 + 운송비 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* 기본 정보 */}
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-medium text-sm">기본 정보</h3>

          {!isEditing && (
            <div className="space-y-1">
              <Label htmlFor="shipping_doc_id">
                선적서류 <span className="text-red-500">*</span>
              </Label>
              {availableShippings.length === 0 ? (
                <p className="text-sm text-zinc-500 py-2">
                  연결 가능한 선적서류가 없습니다.
                </p>
              ) : (
                <Select
                  name="shipping_doc_id"
                  defaultValue={defaultShippingId}
                  required
                >
                  <SelectTrigger id="shipping_doc_id">
                    <SelectValue placeholder="선적서류 선택..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableShippings.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.ci_no}
                        {s.vessel ? ` (${s.vessel})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="customs_no">통관번호</Label>
            <Input
              id="customs_no"
              name="customs_no"
              placeholder="관세청 수입신고번호 (선택)"
              maxLength={50}
              defaultValue={defaultValues?.customs_no ?? ""}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="customs_date">통관일</Label>
            <Input
              id="customs_date"
              name="customs_date"
              type="date"
              defaultValue={defaultValues?.customs_date ?? ""}
            />
          </div>
        </div>

        {/* 운송비 */}
        <CustomsFeeInput
          prefix="transport"
          label="운송비"
          defaultSupply={defaultValues?.transport_fee?.supply ?? 0}
          defaultVat={defaultValues?.transport_fee?.vat ?? 0}
          onTotalChange={(t) => setFeeTotals((prev) => ({ ...prev, transport: t }))}
        />

        {/* 관세 */}
        <CustomsFeeInput
          prefix="customs"
          label="관세"
          defaultSupply={defaultValues?.customs_fee?.supply ?? 0}
          defaultVat={defaultValues?.customs_fee?.vat ?? 0}
          onTotalChange={(t) => setFeeTotals((prev) => ({ ...prev, customs: t }))}
        />

        {/* 부가세 */}
        <CustomsFeeInput
          prefix="vat"
          label="부가세"
          defaultSupply={defaultValues?.vat_fee?.supply ?? 0}
          defaultVat={defaultValues?.vat_fee?.vat ?? 0}
          onTotalChange={(t) => setFeeTotals((prev) => ({ ...prev, vat: t }))}
        />
      </div>

      {/* 기타비용 (full width) */}
      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="font-medium text-sm">기타비용</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <CustomsFeeInput
            prefix="etc"
            label="기타비용"
            defaultSupply={defaultValues?.etc_fee?.supply ?? 0}
            defaultVat={defaultValues?.etc_fee?.vat ?? 0}
            onTotalChange={(t) => setFeeTotals((prev) => ({ ...prev, etc: t }))}
          />
          <div className="space-y-1">
            <Label htmlFor="etc_desc">비용 설명</Label>
            <Textarea
              id="etc_desc"
              name="etc_desc"
              placeholder="기타비용에 대한 설명을 입력하세요..."
              rows={4}
              maxLength={500}
              defaultValue={defaultValues?.etc_desc ?? ""}
            />
          </div>
        </div>
      </div>

      {/* 총 비용 합계 */}
      <div className="rounded-lg border bg-zinc-50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-600">총 비용 합계</span>
        <span className="text-lg font-bold">
          {new Intl.NumberFormat("ko-KR", {
            style: "currency",
            currency: "KRW",
            minimumFractionDigits: 0,
          }).format(grandTotal)}
        </span>
      </div>

      {/* 버튼 */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          취소
        </Button>
        <Button type="submit" disabled={!isEditing && availableShippings.length === 0}>
          {isEditing ? "수정" : "작성"}
        </Button>
      </div>
    </Form>
  );
}
