import { useLoaderData, useFetcher } from "react-router";
import { useState, useRef, useEffect } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Plus, Pencil, Trash2 } from "~/components/ui/icons";
import { loader, action } from "~/loaders/settings.organizations.server";

export { loader, action };

// S-6: loader 반환 타입에서 파생하여 수동 타입 정의 제거
type Org = ReturnType<typeof useLoaderData<typeof loader>>["orgs"][number];

const ORG_TYPE_LABELS: Record<string, string> = {
  supplier: "공급자",
  seller: "판매자",
  buyer: "구매자",
};

const ORG_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  supplier: "secondary",
  seller: "default",
  buyer: "outline",
};

function OrgDialog({
  open,
  onClose,
  org,
}: {
  open: boolean;
  onClose: () => void;
  org: Org | null;
}) {
  const fetcher = useFetcher();
  const isEdit = !!org;
  const isPending = fetcher.state !== "idle";

  // M-1: 성공 후 다이얼로그 자동 닫힘
  const prevState = useRef(fetcher.state);
  useEffect(() => {
    if (prevState.current !== "idle" && fetcher.state === "idle") {
      if (fetcher.data && !("error" in fetcher.data)) {
        onClose();
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, onClose]);

  const handleClose = () => {
    if (!isPending) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "거래처 수정" : "거래처 추가"}</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post">
          <input type="hidden" name="_action" value={isEdit ? "update" : "create"} />
          {isEdit && <input type="hidden" name="id" value={org.id} />}
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="type">유형 *</Label>
              <Select name="type" defaultValue={org?.type ?? "supplier"}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">공급자 (Supplier)</SelectItem>
                  <SelectItem value="seller">판매자 (Seller)</SelectItem>
                  <SelectItem value="buyer">구매자 (Buyer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name_en">영문명 *</Label>
              <Input
                id="name_en"
                name="name_en"
                defaultValue={org?.name_en ?? ""}
                placeholder="영문 회사명"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name_ko">한국어명</Label>
              <Input
                id="name_ko"
                name="name_ko"
                defaultValue={org?.name_ko ?? ""}
                placeholder="한국어 회사명"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address_en">영문 주소</Label>
              <Textarea
                id="address_en"
                name="address_en"
                defaultValue={org?.address_en ?? ""}
                placeholder="영문 주소"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address_ko">한국어 주소</Label>
              <Textarea
                id="address_ko"
                name="address_ko"
                defaultValue={org?.address_ko ?? ""}
                placeholder="한국어 주소"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="phone">전화</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={org?.phone ?? ""}
                  placeholder="전화번호"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fax">팩스</Label>
                <Input
                  id="fax"
                  name="fax"
                  defaultValue={org?.fax ?? ""}
                  placeholder="팩스번호"
                />
              </div>
            </div>
          </div>
          {fetcher.data && "error" in fetcher.data && (
            <p className="text-sm text-destructive mb-2">{fetcher.data.error as string}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장 중..." : isEdit ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Page() {
  const { orgs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<Org | null>(null);

  const handleEdit = (org: Org) => {
    setEditOrg(org);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditOrg(null);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditOrg(null);
  };

  const handleDelete = () => {
    if (!deleteOrg) return;
    const formData = new FormData();
    formData.set("_action", "delete");
    formData.set("id", deleteOrg.id);
    fetcher.submit(formData, { method: "post" });
    setDeleteOrg(null);
  };

  return (
    <>
      <Header title="거래처 관리">
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          거래처 추가
        </Button>
      </Header>
      <PageContainer>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>유형</TableHead>
                <TableHead>영문명</TableHead>
                <TableHead>한국어명</TableHead>
                <TableHead>전화</TableHead>
                <TableHead>팩스</TableHead>
                <TableHead className="w-[100px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    등록된 거래처가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <Badge variant={ORG_TYPE_VARIANTS[org.type] ?? "outline"}>
                        {ORG_TYPE_LABELS[org.type] ?? org.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{org.name_en}</TableCell>
                    <TableCell>{org.name_ko ?? "-"}</TableCell>
                    <TableCell>{org.phone ?? "-"}</TableCell>
                    <TableCell>{org.fax ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(org)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteOrg(org)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageContainer>

      <OrgDialog open={dialogOpen} onClose={handleDialogClose} org={editOrg} />

      <AlertDialog open={!!deleteOrg} onOpenChange={(open) => !open && setDeleteOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>거래처를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteOrg?.name_en}</strong>을(를) 삭제합니다. (소프트 삭제 - 데이터는 보존됩니다)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
