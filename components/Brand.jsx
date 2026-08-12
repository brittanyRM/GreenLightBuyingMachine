"use client";

import { useState } from "react";

// The logo, and the print-only bands that carry it onto paper.
//
// Lives in one file so the flyer, the pro forma and anything printed
// later all show the same mark at the same size. /glbm-logo.png is
// served by the app, so it prints without a network round trip.

const GREEN = "#00A651";

export function BrandMark({ height = 34, className = "" }) {
  const [failed, setFailed] = useState(false);

  // A missing file used to leave a blank space, which reads as "the
  // logo wasn't added" rather than "the logo didn't load." Fall back
  // to the wordmark so the sheet is never unbranded, and so the
  // difference is obvious.
  if (failed) {
    return (
      <div
        className={className}
        style={{ height, display: "flex", alignItems: "center" }}
        title="glbm-logo.png did not load — check that public/ is deployed"
      >
        <span
          style={{
            color: GREEN,
            fontWeight: 900,
            fontSize: height * 0.34,
            lineHeight: 1,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          Green Light
          <br />
          <span style={{ color: "#1A1A1A" }}>Buying Machine</span>
        </span>
      </div>
    );
  }

  return (
    <img
      src="/glbm-logo.png"
      alt="Green Light Buying Machine"
      onError={() => setFailed(true)}
      style={{ height, width: "auto" }}
      className={className}
    />
  );
}

// A slim branded band for the top of a printed sheet.
export function PrintHeader({ title, subtitle }) {
  return (
    <div
      className="print-only print-keep mb-4 flex items-end justify-between border-b-2 pb-2"
      style={{ borderColor: GREEN }}
    >
      <div>
        {title && (
          <div className="text-[15px] font-black uppercase leading-none tracking-tight">
            {title}
          </div>
        )}
        {subtitle && (
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-neutral-500">
            {subtitle}
          </div>
        )}
      </div>
      <BrandMark height={38} />
    </div>
  );
}

// Closing band. Prints under the content on every sheet that uses it.
export function PrintFooter({ note }) {
  return (
    <div
      className="print-only print-keep mt-5 flex items-center justify-between border-t pt-2"
      style={{ borderColor: "#d4d4d4" }}
    >
      <div className="text-[8px] leading-snug text-neutral-500">
        {note ||
          "Figures are estimates for underwriting and are not a guarantee of performance."}
        <br />
        Green Light Buying Machine — The Coliving Ecosystem
      </div>
      <BrandMark height={26} />
    </div>
  );
}
