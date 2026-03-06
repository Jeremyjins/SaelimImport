import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
});

// Silence console.error in fire-and-forget sync functions during tests
vi.spyOn(console, "error").mockImplementation(() => {});
