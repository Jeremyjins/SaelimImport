/** 스프레드시트/PDF 수식 인젝션 방지: 선행 =+\-@ 제거 */
export function sanitizeFormulaInjection(v: string): string {
  return v.replace(/^[=+\-@]/, "");
}
