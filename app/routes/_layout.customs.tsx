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
import { Badge } from "~/components/ui/badge";
import { ErrorBanner } from "~/components/shared/error-banner";
import { Plus, Search, Receipt } from "~/components/ui/icons";
import { loader } from "~/loaders/customs.server";
import { formatDate, formatCurrency } from "~/lib/format";
import { calcTotalFees } from "~/lib/customs-utils";
import type { CustomsListItem } from "~/types/customs";

export { loader };

interface LoaderData {
  customs: CustomsListItem[];
  error: string | null;
}

function FeeReceivedBadge({ received }: { received: boolean | null }) {
  if (received) {
    return (
      <Badge className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-100">
        수령완료
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-zinc-500">
      미수령
    </Badge>
  );
}

export default function CustomsPage() {
  const rawData = useLoaderData<typeof loader>() as unknown as LoaderData;
  const { customs, error: loaderError } = rawData;

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const feeFilter = searchParams.get("fee") ?? "all";

  const filtered = useMemo(
    () =>
      customs.filter((c) => {
        if (feeFilter === "received" && c.fee_received !== true) return false;
        if (feeFilter === "not_received" && c.fee_received === true) return false;
        const q = search.toLowerCase();
        return (
          q === "" ||
          (c.customs_no ?? "").toLowerCase().includes(q) ||
          (c.shipping?.ci_no ?? "").toLowerCase().includes(q)
        );
      }),
    [customs, search, feeFilter]
  );

  const counts = useMemo(() => {
    const all = customs.length;
    const received = customs.filter((c) => c.fee_received === true).length;
    const notReceived = customs.filter((c) => !c.fee_received).length;
    return { all, received, notReceived };
  }, [customs]);

  function handleTabChange(value: string) {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") newParams.delete("fee");
    else newParams.set("fee", value);
    setSearchParams(newParams, { replace: true });
  }

  return (
    <>
      <Header title="통관관리">
        <Button size="sm" onClick={() => navigate("/customs/new")}>
          <Plus className="h-4 w-4 mr-1" />
          통관서류 작성
        </Button>
      </Header>

      <PageContainer fullWidth>
        {loaderError && <ErrorBanner message={loaderError} />}

        {/* 필터 & 검색 */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={feeFilter} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="all">전체 ({counts.all})</TabsTrigger>
              <TabsTrigger value="not_received">
                미수령 ({counts.notReceived})
              </TabsTrigger>
              <TabsTrigger value="received">
                수령완료 ({counts.received})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="통관번호 또는 CI번호 검색..."
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
                <TableHead>통관번호</TableHead>
                <TableHead>통관일</TableHead>
                <TableHead>선적서류 (CI)</TableHead>
                <TableHead>선박명</TableHead>
                <TableHead className="text-right">운송비</TableHead>
                <TableHead className="text-right">관세</TableHead>
                <TableHead className="text-right">부가세</TableHead>
                <TableHead className="text-right">총비용</TableHead>
                <TableHead>수령</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <div className="flex flex-col items-center py-10 text-center">
                      <Receipt className="h-10 w-10 text-zinc-300 mb-2" />
                      <p className="text-sm text-zinc-500">
                        {search ? "검색 결과가 없습니다." : "등록된 통관서류가 없습니다."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const totals = calcTotalFees(
                    c.transport_fee,
                    c.customs_fee,
                    c.vat_fee,
                    c.etc_fee
                  );
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-zinc-50"
                      tabIndex={0}
                      onClick={() => navigate(`/customs/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/customs/${c.id}`);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {c.customs_no ?? (
                            <span className="text-zinc-500">-</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {formatDate(c.created_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {c.customs_date ? formatDate(c.customs_date) : "-"}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {c.shipping?.ci_no ?? "-"}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {c.shipping?.vessel ?? "-"}
                      </TableCell>
                      <TableCell className="text-right text-zinc-500">
                        {c.transport_fee
                          ? formatCurrency(c.transport_fee.total, "KRW")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right text-zinc-500">
                        {c.customs_fee
                          ? formatCurrency(c.customs_fee.total, "KRW")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right text-zinc-500">
                        {c.vat_fee
                          ? formatCurrency(c.vat_fee.total, "KRW")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(totals.grandTotal, "KRW")}
                      </TableCell>
                      <TableCell>
                        <FeeReceivedBadge received={c.fee_received} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile 카드 */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-12 w-12 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">
                {search ? "검색 결과가 없습니다." : "등록된 통관서류가 없습니다."}
              </p>
              {!search && (
                <Button size="sm" className="mt-4" onClick={() => navigate("/customs/new")}>
                  통관서류 작성하기
                </Button>
              )}
            </div>
          ) : (
            filtered.map((c) => {
              const totals = calcTotalFees(
                c.transport_fee,
                c.customs_fee,
                c.vat_fee,
                c.etc_fee
              );
              return (
                <Link
                  key={c.id}
                  to={`/customs/${c.id}`}
                  className="block rounded-lg border bg-white p-4 hover:bg-zinc-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">
                      {c.customs_no ?? (
                        <span className="text-zinc-500">통관번호 없음</span>
                      )}
                    </span>
                    <FeeReceivedBadge received={c.fee_received} />
                  </div>
                  <div className="text-xs text-zinc-500 mb-2 flex flex-wrap gap-x-2">
                    <span>CI: {c.shipping?.ci_no ?? "-"}</span>
                    {c.customs_date && (
                      <span>통관일: {formatDate(c.customs_date)}</span>
                    )}
                    {c.shipping?.vessel && (
                      <span>{c.shipping.vessel}</span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-right">
                    총 {formatCurrency(totals.grandTotal, "KRW")}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </PageContainer>
    </>
  );
}
