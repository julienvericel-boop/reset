/**
 * LOT 12 — Timeout sur appels OpenAI (classifieur + chat).
 * Wrapper générique sans dépendance au fetch global.
 */

export type TimeoutOpts = { timeoutMs: number };

const TIMEOUT_MESSAGE = "TIMEOUT";

/**
 * Exécute promiseFactory(signal) avec un timeout.
 * Si timeout atteint : controller.abort() puis throw new Error("TIMEOUT").
 */
export async function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const result = await promiseFactory(signal);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(TIMEOUT_MESSAGE);
    }
    throw err;
  }
}

export { TIMEOUT_MESSAGE };
