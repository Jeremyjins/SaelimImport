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
import { PILineItems } from "~/components/pi/pi-line-items";
import type { PILineItem, SourcePO } from "~/types/pi";

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

interface PIFormProps {
  suppliers: Organization[];
  buyers: Organization[];
  products: Product[];
  error?: string | null;
  // PO에서 참조 생성 시 sourcePO
  sourcePO?: SourcePO | null;
  // 수정 시 기본값
  defaultValues?: {
    pi_date?: string;
    validity?: string;
    ref_no?: string;
    po_id?: string;
    supplier_id?: string;
    buyer_id?: string;
    currency?: string;
    payment_term?: string;
    delivery_term?: string;
    loading_port?: string;
    discharge_port?: string;
    notes?: string;
    details?: PILineItem[];
  };
  submitLabel?: string;
  // 수정 모드에서 _action 구분용
  actionName?: string;
  // 취소 버튼 이동 경로
  cancelTo?: string;
}

export function PIForm({
  suppliers,
  buyers,
  products,
  error,
  sourcePO,
  defaultValues,
  submitLabel = "작성",
  actionName,
  cancelTo = "/pi",
}: PIFormProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // PO에서 참조 생성 시 기본값 병합
  const mergedDefaults = sourcePO
    ? {
        currency: sourcePO.currency,
        payment_term: sourcePO.payment_term ?? "",
        delivery_term: sourcePO.delivery_term ?? "",
        loading_port: sourcePO.loading_port ?? "",
        discharge_port: sourcePO.discharge_port ?? "",
        details: sourcePO.details,
        ...defaultValues,
      }
    : defaultValues;

  return (
    <Form method="post" className="flex flex-col gap-6">
      {actionName && (
        <input type="hidden" name="_action" value={actionName} />
      )}
      {/* PO 참조 안내 배너 */}
      {sourcePO && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <strong>PO {sourcePO.po_no}</strong>에서 정보를 가져왔습니다. 판매단가를 확인하고 수정하세요.
        </div>
      )}
      {/* po_id hidden input — 생성(sourcePO) 및 수정(defaultValues.po_id) 모드 모두 렌더링 */}
      {(sourcePO?.id || mergedDefaults?.po_id) && (
        <input
          type="hidden"
          name="po_id"
          value={sourcePO?.id ?? mergedDefaults?.po_id ?? ""}
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
              <Label htmlFor="pi_date">PI 일자 *</Label>
              <Input
                id="pi_date"
                name="pi_date"
                type="date"
                required
                defaultValue={
                  mergedDefaults?.pi_date ??
                  new Date().toISOString().split("T")[0]
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="validity">유효기간</Label>
              <Input
                id="validity"
                name="validity"
                type="date"
                defaultValue={mergedDefaults?.validity ?? ""}
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
          </CardContent>
        </Card>

        {/* 거래 조건 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">거래 조건</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier_id">판매자 *</Label>
              <Select
                name="supplier_id"
                required
                defaultValue={mergedDefaults?.supplier_id ?? (suppliers[0]?.id)}
              >
                <SelectTrigger id="supplier_id">
                  <SelectValue placeholder="판매자 선택" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buyer_id">구매자 *</Label>
              <Select
                name="buyer_id"
                required
                defaultValue={mergedDefaults?.buyer_id ?? (buyers[0]?.id)}
              >
                <SelectTrigger id="buyer_id">
                  <SelectValue placeholder="구매자 선택" />
                </SelectTrigger>
                <SelectContent>
                  {buyers.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
      </div>

      {/* 품목 내역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">품목 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <PILineItems
            products={products}
            initialItems={mergedDefaults?.details}
          />
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
