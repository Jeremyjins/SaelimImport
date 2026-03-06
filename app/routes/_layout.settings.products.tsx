import { useLoaderData, useFetcher } from "react-router";
import { useState, useRef, useEffect } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
import { Card } from "~/components/ui/card";
import { loader, action } from "~/loaders/settings.products.server";

export { loader, action };

// S-6: loader 반환 타입에서 파생하여 수동 타입 정의 제거
type Product = ReturnType<typeof useLoaderData<typeof loader>>["products"][number];

function ProductDialog({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const fetcher = useFetcher();
  const isEdit = !!product;
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "제품 수정" : "제품 추가"}</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post">
          <input type="hidden" name="_action" value={isEdit ? "update" : "create"} />
          {isEdit && <input type="hidden" name="id" value={product.id} />}
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="name">제품명 *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={product?.name ?? ""}
                placeholder="제품명"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="gsm">GSM (g/m²)</Label>
                <Input
                  id="gsm"
                  name="gsm"
                  type="number"
                  defaultValue={product?.gsm ?? ""}
                  placeholder="예: 40"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="width_mm">너비 (mm)</Label>
                <Input
                  id="width_mm"
                  name="width_mm"
                  type="number"
                  defaultValue={product?.width_mm ?? ""}
                  placeholder="예: 1000"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hs_code">HS 코드</Label>
              <Input
                id="hs_code"
                name="hs_code"
                defaultValue={product?.hs_code ?? ""}
                placeholder="예: 4806.40-0000"
              />
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
  const { products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);

  const handleEdit = (product: Product) => {
    setEditProduct(product);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditProduct(null);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditProduct(null);
  };

  const handleDelete = () => {
    if (!deleteProduct) return;
    const formData = new FormData();
    formData.set("_action", "delete");
    formData.set("id", deleteProduct.id);
    fetcher.submit(formData, { method: "post" });
    setDeleteProduct(null);
  };

  return (
    <>
      <Header title="제품 관리">
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          제품 추가
        </Button>
      </Header>
      <PageContainer>
        {/* Desktop table */}
        <div className="hidden md:block rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제품명</TableHead>
                <TableHead>GSM</TableHead>
                <TableHead>너비 (mm)</TableHead>
                <TableHead>HS 코드</TableHead>
                <TableHead className="w-[100px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    등록된 제품이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.gsm != null ? `${product.gsm} g/m²` : "-"}</TableCell>
                    <TableCell>{product.width_mm != null ? `${product.width_mm} mm` : "-"}</TableCell>
                    <TableCell>{product.hs_code ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteProduct(product)}
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
          {products.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              등록된 제품이 없습니다.
            </p>
          ) : (
            products.map((product) => (
              <Card key={product.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{product.name}</p>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                      {product.gsm != null && <span>GSM: {product.gsm} g/m²</span>}
                      {product.width_mm != null && <span>너비: {product.width_mm} mm</span>}
                    </div>
                    {product.hs_code && (
                      <p className="text-xs text-muted-foreground mt-0.5">HS: {product.hs_code}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(product)}
                      aria-label="수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteProduct(product)}
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

      <ProductDialog open={dialogOpen} onClose={handleDialogClose} product={editProduct} />

      <AlertDialog open={!!deleteProduct} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>제품을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteProduct?.name}</strong>을(를) 삭제합니다. (소프트 삭제 - 데이터는 보존됩니다)
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
