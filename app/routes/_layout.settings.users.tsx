import { useLoaderData, useFetcher } from "react-router";
import { useState, useRef, useEffect } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
import { Plus, Trash2, Pencil } from "~/components/ui/icons";
import { Card } from "~/components/ui/card";
import { formatDate } from "~/lib/format";
import { loader, action } from "~/loaders/settings.users.server";

export { loader, action };

// S-6: loader 반환 타입에서 파생하여 수동 타입 정의 제거
type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type User = LoaderData["users"][number];
type Org = LoaderData["orgs"][number];

const ORG_TYPE_LABELS: Record<string, string> = {
  gv: "GV",
  saelim: "세림",
  supplier: "공급자",
};

const ORG_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  gv: "default",
  saelim: "secondary",
  supplier: "outline",
};

function getOrgTypeFromOrg(org: Org): "gv" | "saelim" | "supplier" {
  if (org.type === "seller") return "gv";
  if (org.type === "buyer") return "saelim";
  return "supplier";
}

function InviteDialog({
  open,
  onClose,
  orgs,
}: {
  open: boolean;
  onClose: () => void;
  orgs: Org[];
}) {
  const fetcher = useFetcher();
  const isPending = fetcher.state !== "idle";
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // M-1: 성공 후 다이얼로그 자동 닫힘
  const prevState = useRef(fetcher.state);
  useEffect(() => {
    if (prevState.current !== "idle" && fetcher.state === "idle") {
      if (fetcher.data && !("error" in fetcher.data)) {
        setSelectedOrgId("");
        onClose();
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, onClose]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
  const inferredOrgType = selectedOrg ? getOrgTypeFromOrg(selectedOrg) : "";

  const handleClose = () => {
    if (!isPending) {
      setSelectedOrgId("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>사용자 초대</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post">
          <input type="hidden" name="_action" value="invite" />
          {/* S-1: org_type은 서버에서 org_id 기반으로 파생 - 클라이언트 전송 불필요 */}
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="email">이메일 *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">이름 *</Label>
              <Input id="name" name="name" placeholder="홍길동" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org_id">조직 *</Label>
              <Select
                name="org_id"
                value={selectedOrgId}
                onValueChange={setSelectedOrgId}
                required
              >
                <SelectTrigger id="org_id">
                  <SelectValue placeholder="조직 선택" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name_ko ?? org.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {inferredOrgType && (
                <p className="text-xs text-muted-foreground">
                  접근 유형: <strong>{ORG_TYPE_LABELS[inferredOrgType]}</strong>
                  {inferredOrgType === "saelim" && " (배송관리만 접근 가능)"}
                  {inferredOrgType === "gv" && " (전체 접근)"}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">역할</Label>
              <Select name="role" defaultValue="member">
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">관리자</SelectItem>
                  <SelectItem value="member">멤버</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {fetcher.data && "error" in fetcher.data && (
            <p className="text-sm text-destructive mb-2">{fetcher.data.error as string}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              취소
            </Button>
            <Button type="submit" disabled={isPending || !selectedOrgId}>
              {isPending ? "초대 중..." : "초대 발송"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  orgs,
  onClose,
}: {
  user: User | null;
  orgs: Org[];
  onClose: () => void;
}) {
  const fetcher = useFetcher();
  const isPending = fetcher.state !== "idle";
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // 다이얼로그 열릴 때 현재 값으로 초기화
  useEffect(() => {
    if (user) {
      setSelectedOrgId(user.org_id ?? "");
    }
  }, [user]);

  // 성공 후 자동 닫힘
  const prevState = useRef(fetcher.state);
  useEffect(() => {
    if (prevState.current !== "idle" && fetcher.state === "idle") {
      if (fetcher.data && !("error" in fetcher.data)) {
        onClose();
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, onClose]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
  const inferredOrgType = selectedOrg ? getOrgTypeFromOrg(selectedOrg) : "";

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>사용자 수정</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post">
          <input type="hidden" name="_action" value="update" />
          <input type="hidden" name="user_id" value={user.id} />
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">이름 *</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={user.name}
                placeholder="홍길동"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-org_id">조직 *</Label>
              <Select
                name="org_id"
                value={selectedOrgId}
                onValueChange={setSelectedOrgId}
                required
              >
                <SelectTrigger id="edit-org_id">
                  <SelectValue placeholder="조직 선택" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name_ko ?? org.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {inferredOrgType && (
                <p className="text-xs text-muted-foreground">
                  접근 유형: <strong>{ORG_TYPE_LABELS[inferredOrgType]}</strong>
                  {inferredOrgType === "saelim" && " (배송관리만 접근 가능)"}
                  {inferredOrgType === "gv" && " (전체 접근)"}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role">역할</Label>
              <Select name="role" defaultValue={user.role ?? "member"}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">관리자</SelectItem>
                  <SelectItem value="member">멤버</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {fetcher.data && "error" in fetcher.data && (
            <p className="text-sm text-destructive mb-2">{fetcher.data.error as string}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              취소
            </Button>
            <Button type="submit" disabled={isPending || !selectedOrgId}>
              {isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Page() {
  const { users, orgs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);

  const handleDelete = () => {
    if (!deleteUser) return;
    const formData = new FormData();
    formData.set("_action", "delete");
    formData.set("user_id", deleteUser.id);
    fetcher.submit(formData, { method: "post" });
    setDeleteUser(null);
  };

  return (
    <>
      <Header title="사용자 관리">
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          사용자 초대
        </Button>
      </Header>
      <PageContainer>
        {/* Desktop table */}
        <div className="hidden md:block rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>조직</TableHead>
                <TableHead>접근 유형</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>마지막 로그인</TableHead>
                <TableHead className="w-[100px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    등록된 사용자가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name || "-"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.org_name ?? "-"}</TableCell>
                    <TableCell>
                      {user.org_type ? (
                        <Badge variant={ORG_TYPE_VARIANTS[user.org_type] ?? "outline"}>
                          {ORG_TYPE_LABELS[user.org_type] ?? user.org_type}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role === "admin" ? "관리자" : "멤버"}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.confirmed_at ? (
                        <Badge variant="secondary">활성</Badge>
                      ) : user.invited_at ? (
                        <Badge variant="outline">초대됨</Badge>
                      ) : (
                        <Badge variant="outline">미확인</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditUser(user)}
                          aria-label="수정"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteUser(user)}
                          aria-label="삭제"
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

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              등록된 사용자가 없습니다.
            </p>
          ) : (
            users.map((user) => (
              <Card key={user.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{user.name || user.email}</p>
                    {user.name && (
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {user.org_name && (
                        <span className="text-xs text-muted-foreground">{user.org_name}</span>
                      )}
                      {user.org_type && (
                        <Badge variant={ORG_TYPE_VARIANTS[user.org_type] ?? "outline"} className="text-xs">
                          {ORG_TYPE_LABELS[user.org_type] ?? user.org_type}
                        </Badge>
                      )}
                      {user.confirmed_at ? (
                        <Badge variant="secondary" className="text-xs">활성</Badge>
                      ) : user.invited_at ? (
                        <Badge variant="outline" className="text-xs">초대됨</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">미확인</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditUser(user)}
                      aria-label="수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteUser(user)}
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </PageContainer>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        orgs={orgs}
      />

      <EditUserDialog
        user={editUser}
        orgs={orgs}
        onClose={() => setEditUser(null)}
      />

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>사용자를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteUser?.email}</strong> 사용자를 삭제합니다.
              모든 데이터와 접근 권한이 제거됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
