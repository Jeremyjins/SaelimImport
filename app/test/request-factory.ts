export function makeRequest(
  path: string,
  options: { method?: string; body?: FormData | URLSearchParams } = {}
): Request {
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    body: options.body,
  });
}

export function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}
