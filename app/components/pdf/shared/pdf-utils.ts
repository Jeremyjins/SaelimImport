/**
 * PDF-specific formatters — use en-US locale only.
 * Do NOT import or use lib/format.ts (ko-KR locale) here.
 */

export function formatPdfDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr + "T00:00:00Z");
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

export function formatPdfCurrency(
  amount: number | null | undefined,
  currency: string
): string {
  if (amount === null || amount === undefined) return "-";
  if (currency === "KRW") {
    return `KRW ${Math.round(amount).toLocaleString("en-US")}`;
  }
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPdfNumber(
  num: number | null | undefined,
  decimals = 0
): string {
  if (num === null || num === undefined) return "-";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPdfWeight(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "-";
  return `${kg.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} KG`;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const safeName = filename.replace(/[^a-zA-Z0-9._\-]/g, "_");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.href = url;
  a.download = safeName;
  try {
    a.click();
  } finally {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
