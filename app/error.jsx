"use client";

// Next's built-in fallback says only "a client-side exception has
// occurred." That's useless on a deployed build, where the stack is
// minified and the console is the only place the real message lives.
// This shows the message on screen so it can be read and copied.

export default function Error({ error, reset }) {
  const detail = [
    error?.message,
    error?.digest ? `digest ${error.digest}` : null,
    error?.stack,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="mx-auto max-w-3xl p-6 font-sans">
      <div className="rounded border-l-4 border-red-600 bg-red-50 p-5">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-red-900">
          This page hit an error
        </h2>

        <p className="mt-2 font-mono text-[12px] leading-relaxed text-red-900">
          {error?.message || String(error)}
        </p>

        {error?.stack && (
          <pre className="mt-3 max-h-56 overflow-auto rounded bg-red-100 p-2 font-mono text-[10px] leading-snug text-red-900">
            {error.stack}
          </pre>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => reset()}
            className="rounded bg-red-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
          >
            Try again
          </button>
          <button
            onClick={() => navigator.clipboard?.writeText(detail)}
            className="rounded border border-red-300 px-3 py-1.5 text-[11px] font-semibold text-red-800"
          >
            Copy error
          </button>
        </div>
      </div>
    </div>
  );
}
