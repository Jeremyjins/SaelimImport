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
import { POLineItems } from "~/components/po/po-line-items";
import type { POLineItem } from "~/types/po";

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

interface POFormProps {
  suppliers: Organization[];
  buyers: Organization[];
  products: Product[];
  error?: string | null;
  // 수정 시 기본값
  defaultValues?: {
    po_date?: string;
    validity?: string;
    ref_no?: string;
    supplier_id?: string;
    buyer_id?: string;
    currency?: string;
    payment_term?: string;
    delivery_term?: string;
    loading_port?: string;
    discharge_port?: string;
    notes?: string;
    details?: POLineItem[];
  };
  submitLabel?: string;
  // 수정 모드에서 _action 구분용 (예: "update")
  actionName?: string;
  // 취소 버튼 이동 경로 (기본값: "/po")
  cancelTo?: string;
}

export function POForm({
  suppliers,
  buyers,
  products,
  error,
  defaultValues,
  submitLabel = "작성",
  actionName,
  cancelTo = "/po",
}: POFormProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <Form method="post" className="flex flex-col gap-6">
      {actionName && (
        <input type="hidden" name="_action" value={actionName} />
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
              <Label htmlFor="po_date">PO 일자 *</Label>
              <Input
                id="po_date"
                name="po_date"
                type="date"
                required
                defaultValue={
                  defaultValues?.po_date ??
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
                defaultValue={defaultValues?.validity ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ref_no">참조번호</Label>
              <Input
                id="ref_no"
                name="ref_no"
                placeholder="REF-"
                maxLength={100}
                defaultValue={defaultValues?.ref_no ?? ""}
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
              <Label htmlFor="supplier_id">공급업체 *</Label>
              <Select
                name="supplier_id"
                required
                defaultValue={defaultValues?.supplier_id}
              >
                <SelectTrigger id="supplier_id">
                  <SelectValue placeholder="공급업체 선택" />
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
              <Label htmlFor="buyer_id">구매업체 *</Label>
              <Select
                name="buyer_id"
                required
                defaultValue={defaultValues?.buyer_id}
              >
                <SelectTrigger id="buyer_id">
                  <SelectValue placeholder="구매업체 선택" />
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
                defaultValue={defaultValues?.currency ?? "USD"}
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
                defaultValue={defaultValues?.payment_term ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delivery_term">인도조건</Label>
              <Input
                id="delivery_term"
                name="delivery_term"
                placeholder="CFR Busan"
                defaultValue={defaultValues?.delivery_term ?? ""}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loading_port">선적항</Label>
                <Input
                  id="loading_port"
                  name="loading_port"
                  placeholder="Keelung"
                  defaultValue={defaultValues?.loading_port ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discharge_port">양륙항</Label>
                <Input
                  id="discharge_port"
                  name="discharge_port"
                  placeholder="Busan"
                  defaultValue={defaultValues?.discharge_port ?? ""}
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
          <POLineItems
            products={products}
            initialItems={defaultValues?.details}
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
            defaultValue={defaultValues?.notes ?? ""}
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
