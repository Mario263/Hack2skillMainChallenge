"use client";

// Top-level boundary for errors thrown in the root layout itself. Must render
// its own <html>/<body>. Kept dependency-free so it can't fail to render.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "28rem", color: "#5b6170" }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            height: "2.5rem",
            padding: "0 1.25rem",
            borderRadius: "0.6rem",
            border: "none",
            background: "#6366f1",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
