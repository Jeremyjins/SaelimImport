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
import { Plus, Search } from "~/components/ui/icons";
import type { ShippingListItem } from "~/types/shipping";
import { loader } from "~/loaders/shipping.server";
import { formatDate, formatCurrency } from "~/lib/format";

export { loader };

export default function ShippingListPage() {
  const rawData = useLoaderData<typeof loader>() as unknown as {
    shippingDocs: ShippingListItem[];
    error?: string;
  };
  const shippingDocs = rawData.shippingDocs;
  const loaderError = rawData.error;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const statusFilter = searchParams.get("status") ?? "all";

  const filtered = useMemo(
    () =>
      shippingDocs.filter((sd) => {
        const matchStatus = statusFilter === "all" || sd.status === statusFilter;
        const q = search.toLowerCase();
        const matchSearch =
          q === "" ||
          sd.ci_no.toLowerCase().includes(q) ||
          sd.pl_no.toLowerCase().includes(q) ||
          (sd.pi?.pi_no ?? "").toLowerCase().includes(q);
        return matchStatus && matchSearch;
      }),
    [shippingDocs, statusFilter, search]
  );

  const counts = useMemo(() => {
    const result = { all: shippingDocs.length, process: 0, complete: 0 };
    for (const sd of shippingDocs) {
      if (sd.status === "process") result.process++;
      else if (sd.status === "complete") result.complete++;
    }
    return result;
  }, [shippingDocs]);

  function handleTabChange(value: string) {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") {
      newParams.delete("status");
    } else {
      newParams.set("status", value);
    }
    setSearchParams(newParams, { replace: true });
  }

  return (
    <>
      <Header title="선적서류">
        <Button asChild size="sm">
          <Link to="/shipping/new">
            <Plus className="h-4 w-4 mr-1" />
            선적서류 작성
          </Link>
        </Button>
      </Header>

      <PageContainer fullWidth>
        {/* 로더 에러 */}
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
              <TabsTrigger value="process">진행 ({counts.process})</TabsTrigger>
              <TabsTrigger value="complete">완료 ({counts.complete})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="CI번호 또는 PL번호 검색..."
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
                <TableHead>CI / PL 번호</TableHead>
                <TableHead>CI 일자</TableHead>
                <TableHead>PI 번호</TableHead>
                <TableHead>송하인</TableHead>
                <TableHead>선박명</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-zinc-400">
                    {search ? "검색 결과가 없습니다." : "등록된 선적서류가 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((sd) => (
                  <TableRow
                    key={sd.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    tabIndex={0}
                    onClick={() => navigate(`/shipping/${sd.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/shipping/${sd.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <div className="font-medium">{sd.ci_no}</div>
                      <div className="text-xs text-zinc-400">{sd.pl_no}</div>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDate(sd.ci_date)}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {sd.pi?.pi_no ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {sd.shipper?.name_en ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {sd.vessel ?? "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(sd.amount, sd.currency)}
                    </TableCell>
                    <TableCell>
                      <DocStatusBadge status={sd.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile 카드 목록 */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">
              {search ? "검색 결과가 없습니다." : "등록된 선적서류가 없습니다."}
            </div>
          ) : (
            filtered.map((sd) => (
              <Link
                key={sd.id}
                to={`/shipping/${sd.id}`}
                className="block rounded-lg border bg-white p-4 hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="font-semibold text-sm">{sd.ci_no}</span>
                    <span className="text-xs text-zinc-400 ml-1.5">/ {sd.pl_no}</span>
                  </div>
                  <DocStatusBadge status={sd.status} />
                </div>
                <div className="text-xs text-zinc-500 flex gap-2 mb-2">
                  <span>PI: {sd.pi?.pi_no ?? "-"}</span>
                  <span>|</span>
                  <span>{formatDate(sd.ci_date)}</span>
                  {sd.vessel && (
                    <>
                      <span>|</span>
                      <span>{sd.vessel}</span>
                    </>
                  )}
                </div>
                <div className="text-right text-sm font-medium tabular-nums">
                  {formatCurrency(sd.amount, sd.currency)}
                </div>
              </Link>
            ))
          )}
        </div>
      </PageContainer>
    </>
  );
}
