"use client";

import { Component } from "react";

// A crash in one tab shouldn't blank the whole page. Shows the actual
// error so it can be read and reported, rather than "a client-side
// exception has occurred."
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("Caught in boundary:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { error, info } = this.state;
    const stack = (info?.componentStack || "").split("\n").slice(0, 6).join("\n");

    return (
      <div className="m-4 rounded border-l-4 border-red-600 bg-red-50 p-5 font-sans">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-red-900">
          {this.props.label || "This section"} hit an error
        </h2>

        <p className="mt-2 font-mono text-[12px] leading-relaxed text-red-900">
          {error?.message || String(error)}
        </p>

        {stack && (
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-red-100 p-2 font-mono text-[10px] leading-snug text-red-900">
            {stack}
          </pre>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => this.setState({ error: null, info: null })}
            className="rounded bg-red-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
          >
            Try again
          </button>
          <button
            onClick={() =>
              navigator.clipboard?.writeText(
                `${error?.message || error}\n\n${info?.componentStack || ""}`
              )
            }
            className="rounded border border-red-300 px-3 py-1.5 text-[11px] font-semibold text-red-800"
          >
            Copy error
          </button>
        </div>
      </div>
    );
  }
}
