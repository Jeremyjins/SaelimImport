import { useLoaderData, useSearchParams, useNavigate, Link } from "react-router";
import { useState, useMemo } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import { ErrorBanner } from "~/components/shared/error-banner";
import { OrderCreateDialog } from "~/components/orders/order-create-dialog";
import { OrderCYWarning } from "~/components/orders/order-cy-warning";
import { Plus, Search, Package } from "~/components/ui/icons";
import type { OrderListItem } from "~/types/order";
import { loader } from "~/loaders/orders.server";
import { formatDate } from "~/lib/format";

export { loader };
export { action } from "~/loaders/orders.server";

interface LoaderData {
  orders: OrderListItem[];
  pos: { id: string; po_no: string; po_date: string }[];
  error: string | null;
}

export default function OrdersPage() {
  const rawData = useLoaderData<typeof loader>() as unknown as LoaderData;
  const { orders, pos, error: loaderError } = rawData;

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const statusFilter = searchParams.get("status") ?? "all";

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        const matchStatus = statusFilter === "all" || o.status === statusFilter;
        const q = search.toLowerCase();
        const matchSearch =
          q === "" ||
          (o.saelim_no ?? "").toLowerCase().includes(q) ||
          (o.po?.po_no ?? "").toLowerCase().includes(q) ||
          (o.pi?.pi_no ?? "").toLowerCase().includes(q) ||
          (o.shipping?.ci_no ?? "").toLowerCase().includes(q);
        return matchStatus && matchSearch;
      }),
    [orders, statusFilter, search]
  );

  const counts = useMemo(() => {
    const result = { all: orders.length, process: 0, complete: 0 };
    for (const o of orders) {
      if (o.status === "process") result.process++;
      else if (o.status === "complete") result.complete++;
    }
    return result;
  }, [orders]);

  function handleTabChange(value: string) {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") newParams.delete("status");
    else newParams.set("status", value);
    setSearchParams(newParams, { replace: true });
  }

  return (
    <>
      <Header title="오더관리">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          오더 생성
        </Button>
      </Header>

      <PageContainer fullWidth>
        {loaderError && <ErrorBanner message={loaderError} />}

        {/* 필터 & 검색 */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={statusFilter} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="all">전체 ({counts.all})</TabsTrigger>
              <TabsTrigger value="process">진행 ({counts.process})</TabsTrigger>
              <TabsTrigger value="complete">완료 ({counts.complete})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="세림번호, PO, PI, CI번호 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              aria-label="검색"
            />
          </div>
        </div>

        {/* Desktop 테이블 */}
        <div className="hidden md:block rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>세림번호</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>PI</TableHead>
                <TableHead>CI</TableHead>
                <TableHead>선박명</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>CY</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="flex flex-col items-center py-10 text-center">
                      <Package className="h-10 w-10 text-zinc-300 mb-2" />
                      <p className="text-sm text-zinc-500">
                        {search ? "검색 결과가 없습니다." : "등록된 오더가 없습니다."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    tabIndex={0}
                    onClick={() => navigate(`/orders/${o.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/orders/${o.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <div className="font-medium">{o.saelim_no ?? "-"}</div>
                      <div className="text-xs text-zinc-500">
                        {formatDate(o.created_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.po?.po_no ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.pi?.pi_no ?? (
                        <span className="text-zinc-300">미연결</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.shipping?.ci_no ?? (
                        <span className="text-zinc-300">미연결</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.shipping?.vessel ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.shipping?.eta ? formatDate(o.shipping.eta) : "-"}
                    </TableCell>
                    <TableCell>
                      <OrderCYWarning
                        arrivalDate={o.arrival_date}
                        customsDate={o.customs?.customs_date ?? null}
                      />
                    </TableCell>
                    <TableCell>
                      <DocStatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile 카드 */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">
                {search ? "검색 결과가 없습니다." : "등록된 오더가 없습니다."}
              </p>
              {!search && (
                <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
                  오더 생성하기
                </Button>
              )}
            </div>
          ) : (
            filtered.map((o) => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="block rounded-lg border bg-white p-4 hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">
                    {o.saelim_no ?? (
                      <span className="text-zinc-500">세림번호 없음</span>
                    )}
                  </span>
                  <DocStatusBadge status={o.status} />
                </div>
                <div className="text-xs text-zinc-500 flex flex-wrap gap-x-2 gap-y-0.5 mb-2">
                  <span>PO: {o.po?.po_no ?? "-"}</span>
                  {o.pi && <span>PI: {o.pi.pi_no}</span>}
                  {o.shipping?.vessel && <span>{o.shipping.vessel}</span>}
                  {o.shipping?.eta && (
                    <span>ETA: {formatDate(o.shipping.eta)}</span>
                  )}
                </div>
                <div className="flex justify-end">
                  <OrderCYWarning
                    arrivalDate={o.arrival_date}
                    customsDate={o.customs?.customs_date ?? null}
                  />
                </div>
              </Link>
            ))
          )}
        </div>
      </PageContainer>

      <OrderCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pos={pos}
      />
    </>
  );
}
