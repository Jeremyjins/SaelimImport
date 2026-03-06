import { useFetcher } from "react-router";
import { useState, useRef, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { sanitizeFormulaInjection } from "~/lib/sanitize";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Upload, Loader2, FileUp } from "~/components/ui/icons";
import type { StuffingList, StuffingRollDetail } from "~/types/shipping";

const CSV_MAX_SIZE = 500 * 1024; // 500KB
const CSV_MAX_ROWS = 500;

// 수식 인젝션 방지 (공유 함수 래퍼: coerce + trim 포함)
function sanitize(v: string): string {
  return sanitizeFormulaInjection(String(v ?? "")).trim();
}

interface CSVRowError {
  rowIndex: number;
  message: string;
}

interface ParseResult {
  rows: StuffingRollDetail[];
  errors: CSVRowError[];
}

// 헤더 키 정규화 (영문/한국어 헤더 모두 지원)
const HEADER_MAP: Record<string, keyof StuffingRollDetail> = {
  "roll no": "roll_no",
  "롤번호": "roll_no",
  "rollno": "roll_no",
  "roll_no": "roll_no",
  "product name": "product_name",
  "품목명": "product_name",
  "productname": "product_name",
  "product_name": "product_name",
  "gsm": "gsm",
  "width(mm)": "width_mm",
  "폭(mm)": "width_mm",
  "width_mm": "width_mm",
  "widthmm": "width_mm",
  "length(m)": "length_m",
  "길이(m)": "length_m",
  "length_m": "length_m",
  "lengthm": "length_m",
  "net weight(kg)": "net_weight_kg",
  "순중량(kg)": "net_weight_kg",
  "net_weight_kg": "net_weight_kg",
  "netweightkg": "net_weight_kg",
  "gross weight(kg)": "gross_weight_kg",
  "총중량(kg)": "gross_weight_kg",
  "gross_weight_kg": "gross_weight_kg",
  "grossweightkg": "gross_weight_kg",
};

function normalizeKey(h: string): keyof StuffingRollDetail | null {
  const normalized = h.toLowerCase().replace(/\s+/g, " ").trim();
  return HEADER_MAP[normalized] ?? null;
}

async function parseCSV(text: string): Promise<ParseResult> {
  const { default: Papa } = await import("papaparse");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: StuffingRollDetail[] = [];
  const errors: CSVRowError[] = [];

  // 헤더 매핑 확인
  const headers = result.meta.fields ?? [];
  const fieldMap: Partial<Record<keyof StuffingRollDetail, string>> = {};
  for (const h of headers) {
    const mapped = normalizeKey(h);
    if (mapped) fieldMap[mapped] = h;
  }

  const requiredFields: (keyof StuffingRollDetail)[] = [
    "roll_no",
    "product_name",
    "gsm",
    "width_mm",
    "length_m",
    "net_weight_kg",
    "gross_weight_kg",
  ];

  for (let i = 0; i < result.data.length && i < CSV_MAX_ROWS; i++) {
    const rawRow = result.data[i];
    const rowNum = i + 2; // 헤더 + 1-indexed

    const get = (field: keyof StuffingRollDetail): string => {
      const col = fieldMap[field];
      return col ? sanitize(rawRow[col] ?? "") : "";
    };

    const missingFields = requiredFields.filter((f) => get(f) === "");
    if (missingFields.length > 0) {
      errors.push({
        rowIndex: rowNum,
        message: `행 ${rowNum}: 필수 값이 없습니다 (${missingFields.join(", ")})`,
      });
      continue;
    }

    const roll_no = Number(get("roll_no"));
    const gsm = Number(get("gsm"));
    const width_mm = Number(get("width_mm"));
    const length_m = Number(get("length_m"));
    const net_weight_kg = Number(get("net_weight_kg"));
    const gross_weight_kg = Number(get("gross_weight_kg"));

    if (
      !Number.isFinite(roll_no) || roll_no <= 0 ||
      !Number.isFinite(gsm) || gsm <= 0 ||
      !Number.isFinite(width_mm) || width_mm <= 0 ||
      !Number.isFinite(length_m) || length_m <= 0 ||
      !Number.isFinite(net_weight_kg) || net_weight_kg <= 0 ||
      !Number.isFinite(gross_weight_kg) || gross_weight_kg <= 0
    ) {
      errors.push({
        rowIndex: rowNum,
        message: `행 ${rowNum}: 숫자 값이 올바르지 않습니다`,
      });
      continue;
    }

    rows.push({
      roll_no,
      product_name: get("product_name"),
      gsm,
      width_mm,
      length_m,
      net_weight_kg,
      gross_weight_kg,
    });
  }

  return { rows, errors };
}

interface StuffingCSVUploadProps {
  container: StuffingList;
  open: boolean;
  onClose: () => void;
}

type Step = "select" | "preview";

export function StuffingCSVUpload({ container, open, onClose }: StuffingCSVUploadProps) {
  const fetcher = useFetcher();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<StuffingRollDetail[]>([]);
  const [csvErrors, setCsvErrors] = useState<CSVRowError[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const prevState = useRef(fetcher.state);

  useEffect(() => {
    if (prevState.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as { success?: boolean } | null;
      if (result?.success) {
        onClose();
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, onClose]);

  useEffect(() => {
    if (open) {
      setStep("select");
      setMode("replace");
      setFileError(null);
      setParsedRows([]);
      setCsvErrors([]);
      setFileName("");
    }
  }, [open]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);

    // 확장자 검증
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError(".csv 파일만 업로드 가능합니다.");
      return;
    }

    // Magic-byte 검증: PDF(%PDF) / ZIP(PK\x03\x04) 거부
    const headerBytes = await file.slice(0, 4).arrayBuffer();
    const headerHex = Array.from(new Uint8Array(headerBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (headerHex.startsWith("25504446") || headerHex.startsWith("504b0304")) {
      setFileError("유효하지 않은 파일 형식입니다. CSV 파일만 업로드 가능합니다.");
      return;
    }

    // 크기 검증
    if (file.size > CSV_MAX_SIZE) {
      setFileError("파일 크기는 500KB를 초과할 수 없습니다.");
      return;
    }

    setFileName(file.name);

    const text = await file.text();
    const { rows, errors } = await parseCSV(text);
    setParsedRows(rows);
    setCsvErrors(errors);
    setStep("preview");
  }

  function handleDownloadTemplate() {
    const header = "Roll No,Product Name,GSM,Width(mm),Length(m),Net Weight(kg),Gross Weight(kg)\n";
    const sample = "1,Glassine Paper,50,787,8000,245.30,250.10\n";
    const blob = new Blob([header + sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stuffing-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleUpload() {
    if (parsedRows.length === 0) return;
    fetcher.submit(
      {
        _action: "stuffing_csv",
        stuffing_id: container.id,
        mode,
        roll_details: JSON.stringify(parsedRows),
      },
      { method: "post" }
    );
  }

  const isSubmitting = fetcher.state !== "idle";
  const serverError = (fetcher.data as { error?: string } | null)?.error;
  const canUpload = parsedRows.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CSV 업로드 — {container.sl_no ?? "컨테이너"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {serverError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          )}

          {/* Step 1: 파일 선택 */}
          {step === "select" && (
            <div className="flex flex-col gap-4">
              <div
                className="border-2 border-dashed border-zinc-200 rounded-lg p-8 text-center cursor-pointer hover:border-zinc-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="mx-auto h-8 w-8 text-zinc-400 mb-2" />
                <p className="text-sm text-zinc-600">CSV 파일을 선택하세요</p>
                <p className="text-xs text-zinc-400 mt-1">최대 500KB, 500행</p>
                <Button type="button" variant="outline" size="sm" className="mt-3">
                  <Upload className="mr-1 h-3 w-3" />
                  파일 선택
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />

              {fileError && (
                <p className="text-sm text-red-600">{fileError}</p>
              )}

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-blue-600 hover:underline self-start"
              >
                CSV 템플릿 다운로드
              </button>

              {/* 업로드 모드 */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">업로드 방식</Label>
                <RadioGroup
                  value={mode}
                  onValueChange={(v) => setMode(v as "replace" | "append")}
                  className="flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="replace" id="replace" />
                    <Label htmlFor="replace" className="font-normal cursor-pointer">
                      기존 데이터 교체 (replace)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="append" id="append" />
                    <Label htmlFor="append" className="font-normal cursor-pointer">
                      기존 데이터에 추가 (append)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          {/* Step 2: 미리보기 */}
          {step === "preview" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-600">
                  <span className="font-medium">{fileName}</span>
                  <span className="text-zinc-400 ml-2">
                    ({parsedRows.length}행 성공
                    {csvErrors.length > 0 && `, ${csvErrors.length}행 오류`})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("select");
                    setFileError(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  다시 선택
                </button>
              </div>

              {/* 오류 표시 */}
              {csvErrors.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs font-medium text-amber-700 mb-1">
                    오류 행 ({csvErrors.length}건) — 해당 행은 제외됩니다
                  </p>
                  <ul className="text-xs text-amber-600 space-y-0.5 max-h-24 overflow-y-auto">
                    {csvErrors.map((e) => (
                      <li key={e.rowIndex}>{e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 미리보기 테이블 (최대 10행) */}
              {parsedRows.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b text-zinc-500">
                        <th className="px-2 py-1.5 text-left font-medium">롤#</th>
                        <th className="px-2 py-1.5 text-left font-medium">품목</th>
                        <th className="px-2 py-1.5 text-right font-medium">GSM</th>
                        <th className="px-2 py-1.5 text-right font-medium">폭mm</th>
                        <th className="px-2 py-1.5 text-right font-medium">길이m</th>
                        <th className="px-2 py-1.5 text-right font-medium">순중량</th>
                        <th className="px-2 py-1.5 text-right font-medium">총중량</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parsedRows.slice(0, 10).map((row) => (
                        <tr key={row.roll_no} className="hover:bg-zinc-50">
                          <td className="px-2 py-1.5 tabular-nums">{row.roll_no}</td>
                          <td className="px-2 py-1.5">{row.product_name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.gsm}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.width_mm}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.length_m}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.net_weight_kg}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{row.gross_weight_kg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedRows.length > 10 && (
                    <div className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-50 border-t">
                      처음 10행 표시 중 (전체 {parsedRows.length}행)
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-3 text-sm text-red-700">
                  업로드 가능한 행이 없습니다. CSV 파일과 헤더 형식을 확인하세요.
                </div>
              )}

              {/* 업로드 모드 표시 */}
              <div className="text-xs text-zinc-500">
                업로드 방식:{" "}
                <span className="font-medium">
                  {mode === "replace" ? "기존 데이터 교체" : "기존 데이터에 추가"}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          {step === "preview" && (
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!canUpload || isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {parsedRows.length}행 업로드 확인
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
