import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Plus, Trash2 } from "~/components/ui/icons";
import type { POLineItem } from "~/types/po";

interface Product {
  id: string;
  name: string;
  gsm: number | null;
  width_mm: number | null;
}

interface POLineItemsProps {
  products: Product[];
  initialItems?: POLineItem[];
}

// 내부 상태용 타입 — React key에 _rowId 사용 (W3: key={index} 제거)
type LineItemRow = POLineItem & { _rowId: string };

function getProductLabel(p: Product) {
  const parts: string[] = [];
  if (p.gsm) parts.push(`${p.gsm}gsm`);
  if (p.width_mm) parts.push(`${p.width_mm}mm`);
  return parts.length > 0 ? `${p.name} (${parts.join(", ")})` : p.name;
}

function emptyItem(): LineItemRow {
  return {
    _rowId: crypto.randomUUID(),
    product_id: "",
    product_name: "",
    gsm: null,
    width_mm: null,
    quantity_kg: 0,
    unit_price: 0,
    amount: 0,
  };
}

function withRowId(item: POLineItem): LineItemRow {
  return { ...item, _rowId: crypto.randomUUID() };
}

export function POLineItems({ products, initialItems }: POLineItemsProps) {
  const [items, setItems] = useState<LineItemRow[]>(
    initialItems && initialItems.length > 0
      ? initialItems.map(withRowId)
      : [emptyItem()]
  );

  function updateItem(index: number, patch: Partial<POLineItem>) {
    setItems((prev) => {
      const next = [...prev];
      const updated = { ...next[index], ...patch };
      // 자동 금액 계산
      updated.amount =
        Math.round(updated.quantity_kg * updated.unit_price * 100) / 100;
      next[index] = updated;
      return next;
    });
  }

  function handleProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    updateItem(index, {
      product_id: product.id,
      product_name: product.name,
      gsm: product.gsm,
      width_mm: product.width_mm,
    });
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  // 직렬화 시 _rowId 제외
  const serialized: POLineItem[] = items.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ _rowId: _, ...item }) => item
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Desktop 테이블 헤더 */}
      <div className="hidden md:grid grid-cols-[1fr_120px_120px_120px_40px] gap-2 px-1 text-xs font-medium text-zinc-500">
        <span>품목</span>
        <span>수량 (KG)</span>
        <span>단가</span>
        <span className="text-right">금액</span>
        <span />
      </div>

      {/* 라인 아이템 목록 */}
      {items.map((item, index) => (
        <div key={item._rowId}>
          {/* Desktop 행 */}
          <div className="hidden md:grid grid-cols-[1fr_120px_120px_120px_40px] gap-2 items-center">
            <Select
              value={item.product_id || undefined}
              onValueChange={(val) => handleProductChange(index, val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="품목 선택" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {getProductLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="0"
              value={item.quantity_kg || ""}
              onChange={(e) =>
                updateItem(index, { quantity_kg: parseFloat(e.target.value) || 0 })
              }
            />
            <Input
              type="number"
              min={0}
              step={0.0001}
              placeholder="0.0000"
              value={item.unit_price || ""}
              onChange={(e) =>
                updateItem(index, { unit_price: parseFloat(e.target.value) || 0 })
              }
            />
            <div className="text-right text-sm font-medium tabular-nums pt-1">
              {item.amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeItem(index)}
              disabled={items.length <= 1}
              className="h-8 w-8 text-zinc-400 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile 카드 */}
          <div className="md:hidden border rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-medium">품목 {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeItem(index)}
                disabled={items.length <= 1}
                className="h-7 w-7 text-zinc-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Select
              value={item.product_id || undefined}
              onValueChange={(val) => handleProductChange(index, val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="품목 선택" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {getProductLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">수량 (KG)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0"
                  value={item.quantity_kg || ""}
                  onChange={(e) =>
                    updateItem(index, {
                      quantity_kg: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">단가</label>
                <Input
                  type="number"
                  min={0}
                  step={0.0001}
                  placeholder="0.0000"
                  value={item.unit_price || ""}
                  onChange={(e) =>
                    updateItem(index, {
                      unit_price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="text-right text-sm font-semibold tabular-nums">
              금액:{" "}
              {item.amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>
      ))}

      {/* 합계 행 */}
      <div className="flex justify-between items-center pt-2 border-t">
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" />
          품목 추가
        </Button>
        <div className="text-sm font-semibold tabular-nums">
          합계:{" "}
          {total.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>

      {/* Hidden input - controlled value */}
      <input type="hidden" name="details" value={JSON.stringify(serialized)} />
    </div>
  );
}
