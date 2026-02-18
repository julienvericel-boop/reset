"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body className="antialiased min-h-screen flex flex-col items-center justify-center p-4 bg-[#fafafa] text-[#171717]">
        <p className="text-neutral-500 text-sm mb-4">
          Une erreur s&apos;est produite.
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-neutral-800 text-white text-sm"
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
