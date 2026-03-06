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
import { Plus, Search, FileSpreadsheet } from "~/components/ui/icons";
import type { PIListItem } from "~/types/pi";
import { loader } from "~/loaders/pi.server";
import { formatDate, formatCurrency } from "~/lib/format";

export { loader };

export default function PIListPage() {
  const data = useLoaderData<typeof loader>() as unknown as { pis: PIListItem[]; error?: string };
  const pis = data.pis;
  const loaderError = data.error;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const statusFilter = searchParams.get("status") ?? "all";

  const filtered = useMemo(
    () =>
      pis.filter((pi) => {
        const matchStatus = statusFilter === "all" || pi.status === statusFilter;
        const q = search.toLowerCase();
        const matchSearch =
          q === "" ||
          pi.pi_no.toLowerCase().includes(q) ||
          (pi.po?.po_no ?? "").toLowerCase().includes(q);
        return matchStatus && matchSearch;
      }),
    [pis, statusFilter, search]
  );

  const counts = useMemo(() => {
    const result = { all: pis.length, process: 0, complete: 0 };
    for (const p of pis) {
      if (p.status === "process") result.process++;
      else if (p.status === "complete") result.complete++;
    }
    return result;
  }, [pis]);

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
      <Header title="견적서">
        <Button asChild size="sm">
          <Link to="/pi/new">
            <Plus className="h-4 w-4 mr-1" />
            PI 작성
          </Link>
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
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="PI번호 또는 PO번호 검색..."
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
                <TableHead>PI 번호</TableHead>
                <TableHead>일자</TableHead>
                <TableHead>PO 번호</TableHead>
                <TableHead>구매자</TableHead>
                <TableHead>통화</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="flex flex-col items-center py-10 text-center">
                      <FileSpreadsheet className="h-10 w-10 text-zinc-300 mb-2" />
                      <p className="text-sm text-zinc-500">
                        {search ? "검색 결과가 없습니다." : "등록된 PI가 없습니다."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((pi) => (
                  <TableRow
                    key={pi.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    tabIndex={0}
                    onClick={() => navigate(`/pi/${pi.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/pi/${pi.id}`);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{pi.pi_no}</TableCell>
                    <TableCell className="text-zinc-500">{formatDate(pi.pi_date)}</TableCell>
                    <TableCell className="text-zinc-500">
                      {pi.po?.po_no ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {pi.buyer?.name_en ?? "-"}
                    </TableCell>
                    <TableCell className="text-zinc-500">{pi.currency}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(pi.amount, pi.currency)}
                    </TableCell>
                    <TableCell>
                      <DocStatusBadge status={pi.status} />
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileSpreadsheet className="h-12 w-12 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">
                {search ? "검색 결과가 없습니다." : "등록된 PI가 없습니다."}
              </p>
              {!search && (
                <Button asChild size="sm" className="mt-4">
                  <Link to="/pi/new">PI 작성하기</Link>
                </Button>
              )}
            </div>
          ) : (
            filtered.map((pi) => (
              <Link
                key={pi.id}
                to={`/pi/${pi.id}`}
                className="block rounded-lg border bg-white p-4 hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{pi.pi_no}</span>
                  <DocStatusBadge status={pi.status} />
                </div>
                <div className="text-xs text-zinc-500 flex gap-2">
                  <span>PO: {pi.po?.po_no ?? "-"}</span>
                  <span>|</span>
                  <span>{formatDate(pi.pi_date)}</span>
                </div>
                <div className="text-right text-sm font-medium tabular-nums mt-2">
                  {formatCurrency(pi.amount, pi.currency)}
                </div>
              </Link>
            ))
          )}
        </div>
      </PageContainer>
    </>
  );
}
