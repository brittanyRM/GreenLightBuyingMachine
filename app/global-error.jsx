"use client";

// Last resort — a throw above the root layout. Must render its own
// html and body, because at this point the layout itself is gone.

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h2 style={{ fontSize: 13, textTransform: "uppercase", color: "#7f1d1d" }}>
          The app hit an error
        </h2>
        <p style={{ fontFamily: "monospace", fontSize: 12, color: "#7f1d1d" }}>
          {error?.message || String(error)}
        </p>
        {error?.stack && (
          <pre
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              background: "#fee2e2",
              padding: 8,
              overflow: "auto",
              maxHeight: 240,
            }}
          >
            {error.stack}
          </pre>
        )}
        <button onClick={() => reset()} style={{ marginTop: 12, padding: "6px 12px" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
