"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";

// Route-segment error boundary: catches render/runtime errors and shows a
// calm, accessible fallback instead of a blank screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("ui.error_boundary", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-20 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Sorry about that — an unexpected error occurred. Your saved data is safe.
        You can try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
