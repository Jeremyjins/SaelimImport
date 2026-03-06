import { Form, Link, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
import { Loader2 } from "~/components/ui/icons";
import { ShippingLineItems } from "~/components/shipping/shipping-line-items";
import type { ShippingLineItem, SourcePI } from "~/types/shipping";

interface Organization {
  id: string;
  name_en: string;
  name_ko: string | null;
}

interface Product {
  id: string;
  name: string;
  gsm: number | null;
  width_mm: number | null;
}

interface PI {
  id: string;
  pi_no: string;
}

interface ShippingFormProps {
  shippers: Organization[];
  consignees: Organization[];
  products: Product[];
  pis: PI[];
  error?: string | null;
  // PI에서 참조 생성 시 sourcePI
  sourcePI?: SourcePI | null;
  // 수정 시 기본값
  defaultValues?: {
    ci_date?: string;
    ship_date?: string;
    ref_no?: string;
    pi_id?: string;
    shipper_id?: string;
    consignee_id?: string;
    currency?: string;
    payment_term?: string;
    delivery_term?: string;
    loading_port?: string;
    discharge_port?: string;
    vessel?: string;
    voyage?: string;
    etd?: string;
    eta?: string;
    gross_weight?: number | null;
    net_weight?: number | null;
    package_no?: number | null;
    notes?: string;
    details?: ShippingLineItem[];
  };
  submitLabel?: string;
  // 수정 모드에서 _action 구분용
  actionName?: string;
  // 취소 버튼 이동 경로
  cancelTo?: string;
}

export function ShippingForm({
  shippers,
  consignees,
  products,
  pis,
  error,
  sourcePI,
  defaultValues,
  submitLabel = "작성",
  actionName,
  cancelTo = "/shipping",
}: ShippingFormProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // PI에서 참조 생성 시 기본값 병합
  const mergedDefaults = sourcePI
    ? {
        pi_id: sourcePI.id,
        shipper_id: sourcePI.supplier_id,
        consignee_id: sourcePI.buyer_id,
        currency: sourcePI.currency,
        payment_term: sourcePI.payment_term ?? "",
        delivery_term: sourcePI.delivery_term ?? "",
        loading_port: sourcePI.loading_port ?? "",
        discharge_port: sourcePI.discharge_port ?? "",
        details: sourcePI.details,
        ...defaultValues,
      }
    : defaultValues;

  return (
    <Form method="post" className="flex flex-col gap-6">
      {actionName && (
        <input type="hidden" name="_action" value={actionName} />
      )}

      {/* PI 참조 안내 배너 */}
      {sourcePI && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <strong>PI {sourcePI.pi_no}</strong>에서 정보를 가져왔습니다. 선적 정보를 입력하세요.
        </div>
      )}

      {/* pi_id hidden input */}
      {(sourcePI?.id || mergedDefaults?.pi_id) && (
        <input
          type="hidden"
          name="pi_id"
          value={sourcePI?.id ?? mergedDefaults?.pi_id ?? ""}
        />
      )}

      {/* 오류 표시 */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 상단 2열 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 기본 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ci_date">CI 일자 *</Label>
              <Input
                id="ci_date"
                name="ci_date"
                type="date"
                required
                defaultValue={
                  mergedDefaults?.ci_date ?? new Date().toISOString().split("T")[0]
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship_date">선적일</Label>
              <Input
                id="ship_date"
                name="ship_date"
                type="date"
                defaultValue={mergedDefaults?.ship_date ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ref_no">참조번호</Label>
              <Input
                id="ref_no"
                name="ref_no"
                placeholder="REF-"
                maxLength={100}
                defaultValue={mergedDefaults?.ref_no ?? ""}
              />
            </div>
            {/* PI 참조 선택 (sourcePI가 없을 때만 표시) */}
            {!sourcePI && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pi_id_select">참조 PI</Label>
                <Select
                  name="pi_id"
                  defaultValue={mergedDefaults?.pi_id ?? "__none__"}
                >
                  <SelectTrigger id="pi_id_select">
                    <SelectValue placeholder="PI 선택 (선택 사항)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">PI 선택 안 함</SelectItem>
                    {pis.map((pi) => (
                      <SelectItem key={pi.id} value={pi.id}>
                        {pi.pi_no}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 거래 당사자 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">거래 당사자</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shipper_id">송하인 (Shipper) *</Label>
              <Select
                name="shipper_id"
                required
                defaultValue={mergedDefaults?.shipper_id ?? shippers[0]?.id}
              >
                <SelectTrigger id="shipper_id">
                  <SelectValue placeholder="송하인 선택" />
                </SelectTrigger>
                <SelectContent>
                  {shippers.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consignee_id">수하인 (Consignee) *</Label>
              <Select
                name="consignee_id"
                required
                defaultValue={mergedDefaults?.consignee_id ?? consignees[0]?.id}
              >
                <SelectTrigger id="consignee_id">
                  <SelectValue placeholder="수하인 선택" />
                </SelectTrigger>
                <SelectContent>
                  {consignees.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 거래 조건 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">거래 조건</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">통화 *</Label>
              <Select
                name="currency"
                required
                defaultValue={mergedDefaults?.currency ?? "USD"}
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="KRW">KRW</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment_term">결제조건</Label>
              <Input
                id="payment_term"
                name="payment_term"
                placeholder="T/T in advance"
                defaultValue={mergedDefaults?.payment_term ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delivery_term">인도조건</Label>
              <Input
                id="delivery_term"
                name="delivery_term"
                placeholder="CFR Busan"
                defaultValue={mergedDefaults?.delivery_term ?? ""}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loading_port">선적항</Label>
                <Input
                  id="loading_port"
                  name="loading_port"
                  placeholder="Keelung"
                  defaultValue={mergedDefaults?.loading_port ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discharge_port">양륙항</Label>
                <Input
                  id="discharge_port"
                  name="discharge_port"
                  placeholder="Busan"
                  defaultValue={mergedDefaults?.discharge_port ?? ""}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 선적 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">선적 정보</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vessel">선박명 (Vessel)</Label>
              <Input
                id="vessel"
                name="vessel"
                placeholder="예: EVER GIVEN"
                maxLength={200}
                defaultValue={mergedDefaults?.vessel ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="voyage">항차 (Voyage)</Label>
              <Input
                id="voyage"
                name="voyage"
                placeholder="예: 0001E"
                maxLength={100}
                defaultValue={mergedDefaults?.voyage ?? ""}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="etd">출항예정일 (ETD)</Label>
                <Input
                  id="etd"
                  name="etd"
                  type="date"
                  defaultValue={mergedDefaults?.etd ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eta">도착예정일 (ETA)</Label>
                <Input
                  id="eta"
                  name="eta"
                  type="date"
                  defaultValue={mergedDefaults?.eta ?? ""}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 품목 내역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">품목 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <ShippingLineItems
            products={products}
            initialItems={mergedDefaults?.details}
          />
        </CardContent>
      </Card>

      {/* 중량 / 포장 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">중량 / 포장</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gross_weight">총중량 (KG)</Label>
              <Input
                id="gross_weight"
                name="gross_weight"
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                defaultValue={mergedDefaults?.gross_weight ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="net_weight">순중량 (KG)</Label>
              <Input
                id="net_weight"
                name="net_weight"
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                defaultValue={mergedDefaults?.net_weight ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="package_no">포장수</Label>
              <Input
                id="package_no"
                name="package_no"
                type="number"
                min={0}
                step={1}
                placeholder="0"
                defaultValue={mergedDefaults?.package_no ?? ""}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            스터핑 리스트 등록 후 자동으로 업데이트됩니다.
          </p>
        </CardContent>
      </Card>

      {/* 비고 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">비고</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            name="notes"
            placeholder="추가 사항을 입력하세요"
            rows={3}
            maxLength={2000}
            defaultValue={mergedDefaults?.notes ?? ""}
          />
        </CardContent>
      </Card>

      {/* 액션 버튼 */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" asChild>
          <Link to={cancelTo}>취소</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
