import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import type { Route } from "./+types/_layout.delivery";
import { useState, useMemo } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { DeliveryStatusBadge } from "~/components/delivery/change-request-badge";
import { Search } from "~/components/ui/icons";
import { formatDate } from "~/lib/format";
import type { DeliveryListItem } from "~/types/delivery";
import { loader } from "~/loaders/delivery.server";

export { loader };

export function meta(_args: Route.MetaArgs) {
  return [{ title: "배송관리 | GV International" }];
}

interface LoaderData {
  deliveries: DeliveryListItem[];
  error: string | null;
}

export default function DeliveryPage() {
  const rawData = useLoaderData<typeof loader>() as unknown as LoaderData;
  const { deliveries, error: loaderError } = rawData;

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const statusFilter = searchParams.get("status") ?? "all";

  const filtered = useMemo(
    () =>
      deliveries.filter((d) => {
        const matchStatus =
          statusFilter === "all" ||
          (statusFilter === "active" &&
            (d.status === "pending" || d.status === "scheduled")) ||
          (statusFilter === "delivered" && d.status === "delivered");
        const q = search.toLowerCase();
        const matchSearch =
          q === "" ||
          (d.pi?.pi_no ?? "").toLowerCase().includes(q) ||
          (d.shipping?.ci_no ?? "").toLowerCase().includes(q) ||
          (d.shipping?.vessel ?? "").toLowerCase().includes(q);
        return matchStatus && matchSearch;
      }),
    [deliveries, statusFilter, search]
  );

  const counts = useMemo(() => {
    const result = { all: deliveries.length, active: 0, delivered: 0 };
    for (const d of deliveries) {
      if (d.status === "pending" || d.status === "scheduled") result.active++;
      else if (d.status === "delivered") result.delivered++;
    }
    return result;
  }, [deliveries]);

  function handleTabChange(value: string) {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") newParams.delete("status");
    else newParams.set("status", value);
    setSearchParams(newParams, { replace: true });
  }

  return (
    <>
      <Header title="배송관리" />

      <PageContainer fullWidth>
        {loaderError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {loaderError}
          </div>
        )}

        {/* 필터 & 검색 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="all">전체 ({counts.all})</TabsTrigger>
              <TabsTrigger value="active">진행 ({counts.active})</TabsTrigger>
              <TabsTrigger value="delivered">
                완료 ({counts.delivered})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="PI번호, CI번호, 선박명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Desktop 테이블 */}
        <div className="hidden md:block rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PI번호</TableHead>
                <TableHead>CI번호</TableHead>
                <TableHead>선박명</TableHead>
                <TableHead>배송일</TableHead>
                <TableHead>변경요청</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-zinc-400"
                  >
                    {search ? "검색 결과가 없습니다." : "등록된 배송이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    tabIndex={0}
                    onClick={() => navigate(`/delivery/${d.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/delivery/${d.id}`);
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      {d.pi?.pi_no ?? (
                        <span className="text-zinc-300">미연결</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {d.shipping?.ci_no ?? (
                        <span className="text-zinc-300">미연결</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {d.shipping?.vessel ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {d.delivery_date ? formatDate(d.delivery_date) : "-"}
                    </TableCell>
                    <TableCell>
                      {d.pending_requests > 0 ? (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs">
                          대기 {d.pending_requests}건
                        </Badge>
                      ) : (
                        <span className="text-zinc-300 text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatusBadge status={d.status} />
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
            <div className="text-center py-12 text-zinc-400 text-sm">
              {search ? "검색 결과가 없습니다." : "등록된 배송이 없습니다."}
            </div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.id}
                type="button"
                className="block w-full text-left rounded-lg border bg-white p-4 hover:bg-zinc-50"
                onClick={() => navigate(`/delivery/${d.id}`)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">
                    {d.pi?.pi_no ?? (
                      <span className="text-zinc-400">PI 미연결</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {d.pending_requests > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs">
                        대기 {d.pending_requests}건
                      </Badge>
                    )}
                    <DeliveryStatusBadge status={d.status} />
                  </div>
                </div>
                <div className="text-xs text-zinc-500 flex flex-wrap gap-x-2 gap-y-0.5">
                  {d.shipping?.ci_no && <span>CI: {d.shipping.ci_no}</span>}
                  {d.shipping?.vessel && <span>{d.shipping.vessel}</span>}
                  {d.delivery_date && (
                    <span>배송일: {formatDate(d.delivery_date)}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </PageContainer>
    </>
  );
}
