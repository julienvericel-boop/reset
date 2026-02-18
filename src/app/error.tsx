"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-[var(--bg)]">
      <p className="text-[var(--text-muted)] text-sm mb-4">
        Une erreur s&apos;est produite.
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 rounded-xl bg-neutral-800 text-white text-sm dark:bg-neutral-200 dark:text-neutral-900"
      >
        Réessayer
      </button>
    </div>
  );
}
