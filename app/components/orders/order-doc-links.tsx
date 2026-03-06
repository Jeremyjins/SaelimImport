import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Link2, Unlink, RefreshCw } from "~/components/ui/icons";
import type { OrderDetail } from "~/types/order";

// ── 문서 설정 ────────────────────────────────────────────────

interface DocConfig {
  type: "pi" | "shipping" | "customs" | "delivery";
  label: string;
  subLabel: string;
  enabled: boolean;
  getInfo: (order: OrderDetail) => DocInfo | null;
  getLink: (order: OrderDetail) => string | null;
}

interface DocInfo {
  docNo: string;
  status?: string;
  extra?: string;
}

const DOC_CONFIGS: DocConfig[] = [
  {
    type: "pi",
    label: "견적서",
    subLabel: "PI",
    enabled: true,
    getInfo: (order) =>
      order.pi ? { docNo: order.pi.pi_no, status: order.pi.status } : null,
    getLink: (order) => (order.pi_id ? `/pi/${order.pi_id}` : null),
  },
  {
    type: "shipping",
    label: "선적서류",
    subLabel: "C/I",
    enabled: true,
    getInfo: (order) =>
      order.shipping
        ? {
            docNo: order.shipping.ci_no,
            status: order.shipping.status,
            extra: order.shipping.vessel ?? undefined,
          }
        : null,
    getLink: (order) => (order.shipping_doc_id ? `/shipping/${order.shipping_doc_id}` : null),
  },
  {
    type: "customs",
    label: "통관",
    subLabel: "CUSTOMS",
    enabled: false,
    getInfo: (order) =>
      order.customs
        ? { docNo: order.customs.customs_no ?? "통관#", status: undefined }
        : null,
    getLink: (order) => (order.customs_id ? `/customs/${order.customs_id}` : null),
  },
  {
    type: "delivery",
    label: "배송",
    subLabel: "DELIVERY",
    enabled: false,
    getInfo: (order) =>
      order.delivery ? { docNo: "배송", status: undefined } : null,
    getLink: (_order) => null,
  },
];

// ── Link Dialog ──────────────────────────────────────────────

interface LinkDialogProps {
  open: boolean;
  docType: string;
  docLabel: string;
  onClose: () => void;
  onLink: (docId: string) => void;
}

function LinkDocDialog({ open, docLabel, onClose, onLink }: LinkDialogProps) {
  const [docId, setDocId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = docId.trim();
    if (!trimmed) return;
    onLink(trimmed);
    setDocId("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{docLabel} 연결</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="doc-id">서류 ID (UUID)</Label>
            <Input
              id="doc-id"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={!docId.trim()}>
              연결
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 단일 카드 ────────────────────────────────────────────────

interface DocCardProps {
  config: DocConfig;
  order: OrderDetail;
  onLink: (docType: string, docId: string) => void;
  onUnlink: (docType: string) => void;
}

function DocCard({ config, order, onLink, onUnlink }: DocCardProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const info = config.getInfo(order);
  const href = config.getLink(order);
  const isLinked = !!info;

  return (
    <div
      className={`border rounded-lg p-4 flex flex-col gap-2 min-h-[120px] ${
        isLinked ? "bg-white border-zinc-200" : "bg-zinc-50 border-dashed border-zinc-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
            {config.subLabel}
          </p>
          <p className="text-xs font-semibold text-zinc-600">{config.label}</p>
        </div>
        {isLinked && config.enabled && (
          <button
            onClick={() => onUnlink(config.type)}
            className="text-zinc-400 hover:text-red-500 transition-colors"
            title="연결 해제"
          >
            <Unlink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLinked ? (
        <div className="flex-1 space-y-1">
          {href ? (
            <Link
              to={href}
              className="text-sm font-semibold text-zinc-900 hover:text-blue-600 transition-colors truncate block"
            >
              {info.docNo}
            </Link>
          ) : (
            <p className="text-sm font-semibold text-zinc-900 truncate">{info.docNo}</p>
          )}
          {info.status && (
            <DocStatusBadge status={info.status as "process" | "complete"} />
          )}
          {info.extra && (
            <p className="text-xs text-zinc-500 truncate">{info.extra}</p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <p className="text-sm text-zinc-400">미연결</p>
          {config.enabled ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 h-7 text-xs"
                onClick={() => setLinkDialogOpen(true)}
              >
                <Link2 className="h-3 w-3 mr-1" />
                연결
              </Button>
              <LinkDocDialog
                open={linkDialogOpen}
                docType={config.type}
                docLabel={config.label}
                onClose={() => setLinkDialogOpen(false)}
                onLink={(docId) => onLink(config.type, docId)}
              />
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 h-7 text-xs"
              disabled
            >
              미구현
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── PO 카드 (항상 연결됨, 해제 불가) ────────────────────────

function POCard({ order }: { order: OrderDetail }) {
  return (
    <div className="border rounded-lg p-4 flex flex-col gap-2 min-h-[120px] bg-white border-zinc-200">
      <div>
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">PO</p>
        <p className="text-xs font-semibold text-zinc-600">구매주문</p>
      </div>
      {order.po ? (
        <div className="flex-1 space-y-1">
          <Link
            to={`/po/${order.po_id}`}
            className="text-sm font-semibold text-zinc-900 hover:text-blue-600 transition-colors truncate block"
          >
            {order.po.po_no}
          </Link>
          <DocStatusBadge status={order.po.status} />
        </div>
      ) : (
        <p className="text-sm text-zinc-400">미연결</p>
      )}
    </div>
  );
}

// ── 전체 그리드 ──────────────────────────────────────────────

interface Props {
  order: OrderDetail;
  onRefreshLinks: () => void;
  isRefreshing: boolean;
}

export function OrderDocLinks({ order, onRefreshLinks, isRefreshing }: Props) {
  const fetcher = useFetcher();

  function handleLink(docType: string, docId: string) {
    fetcher.submit(
      { _action: "link_document", doc_type: docType, doc_id: docId },
      { method: "post" }
    );
  }

  function handleUnlink(docType: string) {
    fetcher.submit(
      { _action: "unlink_document", doc_type: docType },
      { method: "post" }
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700">연결 서류</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={onRefreshLinks}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <POCard order={order} />
        {DOC_CONFIGS.map((config) => (
          <DocCard
            key={config.type}
            config={config}
            order={order}
            onLink={handleLink}
            onUnlink={handleUnlink}
          />
        ))}
      </div>
    </div>
  );
}
