import { useState } from "react";
import { useFetcher } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Loader2 } from "~/components/ui/icons";
import { formatDate } from "~/lib/format";

interface PO {
  id: string;
  po_no: string;
  po_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pos: PO[];
}

export function OrderCreateDialog({ open, onOpenChange, pos }: Props) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const [poId, setPoId] = useState("");
  const [saelimNo, setSaelimNo] = useState("");

  const isSubmitting = fetcher.state !== "idle";
  const serverError = fetcher.data && !fetcher.data.success ? fetcher.data.error : null;

  function handleClose(v: boolean) {
    if (!v) {
      setPoId("");
      setSaelimNo("");
    }
    onOpenChange(v);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!poId) return;
    fetcher.submit(
      { _action: "create", po_id: poId, saelim_no: saelimNo },
      { method: "post" }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>오더 생성</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {serverError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="po_id">구매주문 (PO) *</Label>
            <Select value={poId} onValueChange={setPoId}>
              <SelectTrigger id="po_id">
                <SelectValue placeholder="PO를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {pos.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-zinc-400">
                    오더 생성 가능한 PO가 없습니다.
                  </div>
                ) : (
                  pos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.po_no}
                      <span className="ml-1.5 text-zinc-400 text-xs">
                        ({formatDate(p.po_date)})
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="saelim_no">세림번호 (선택)</Label>
            <Input
              id="saelim_no"
              value={saelimNo}
              onChange={(e) => setSaelimNo(e.target.value)}
              maxLength={50}
              placeholder="예: SL-2026-001"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={!poId || isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              생성
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
