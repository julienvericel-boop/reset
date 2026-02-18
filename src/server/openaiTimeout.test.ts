import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout, TIMEOUT_MESSAGE } from "./openaiTimeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("promise resolves before timeout => returns result", async () => {
    const resultPromise = withTimeout(
      async () => {
        return 42;
      },
      5000
    );
    const value = await resultPromise;
    expect(value).toBe(42);
  });

  it("promiseFactory respects signal abort => throws TIMEOUT", async () => {
    const promise = withTimeout(
      async (signal) => {
        return new Promise<number>((resolve, reject) => {
          const onAbort = () => reject(new DOMException("aborted", "AbortError"));
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          setTimeout(() => resolve(1), 10000);
        });
      },
      100
    );
    vi.advanceTimersByTime(150);
    await expect(promise).rejects.toThrow(TIMEOUT_MESSAGE);
  });
});
