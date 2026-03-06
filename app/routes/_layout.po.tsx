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
import type { POListItem } from "~/types/po";
import { loader } from "~/loaders/po.server";
import { formatDate, formatCurrency } from "~/lib/format";

export { loader };

export default function POListPage() {
  const data = useLoaderData<typeof loader>() as unknown as { pos: POListItem[]; error?: string };
  const pos = data.pos;
  const loaderError = data.error;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const statusFilter = searchParams.get("status") ?? "all";

  const filtered = pos.filter((po) => {
    const matchStatus = statusFilter === "all" || po.status === statusFilter;
    const matchSearch =
      search === "" || po.po_no.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  // I6: useMemo + 단일 reduce로 3회 순회 → 1회로 최적화
  const counts = useMemo(() => {
    const result = { all: pos.length, process: 0, complete: 0 };
    for (const p of pos) {
      if (p.status === "process") result.process++;
      else if (p.status === "complete") result.complete++;
    }
    return result;
  }, [pos]);

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
      <Header title="구매주문">
        <Button asChild size="sm">
          <Link to="/po/new">
            <Plus className="h-4 w-4 mr-1" />
            PO 작성
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
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="PO 번호 검색..."
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
                <TableHead>PO 번호</TableHead>
                <TableHead>일자</TableHead>
                <TableHead>공급자</TableHead>
                <TableHead>통화</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-zinc-400">
                    {search ? "검색 결과가 없습니다." : "등록된 PO가 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((po) => (
                  <TableRow
                    key={po.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    tabIndex={0}
                    onClick={() => navigate(`/po/${po.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/po/${po.id}`);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{po.po_no}</TableCell>
                    <TableCell className="text-zinc-500">{formatDate(po.po_date)}</TableCell>
                    <TableCell className="text-zinc-500">
                      {po.supplier?.name_en ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">{po.currency}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(po.amount, po.currency)}
                    </TableCell>
                    <TableCell>
                      <DocStatusBadge status={po.status} />
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
              {search ? "검색 결과가 없습니다." : "등록된 PO가 없습니다."}
            </div>
          ) : (
            filtered.map((po) => (
              <Link
                key={po.id}
                to={`/po/${po.id}`}
                className="block rounded-lg border bg-white p-4 hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{po.po_no}</span>
                  <DocStatusBadge status={po.status} />
                </div>
                <div className="text-xs text-zinc-500 flex gap-2">
                  <span>{po.supplier?.name_en ?? "-"}</span>
                  <span>|</span>
                  <span>{formatDate(po.po_date)}</span>
                </div>
                <div className="text-right text-sm font-medium tabular-nums mt-2">
                  {formatCurrency(po.amount, po.currency)}
                </div>
              </Link>
            ))
          )}
        </div>
      </PageContainer>
    </>
  );
}
