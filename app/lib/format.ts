export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(amount);
}

export function formatWeight(kg: number | null | undefined): string {
  if (kg == null) return "-";
  return (
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(kg) +
    " KG"
  );
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US").format(value);
}
