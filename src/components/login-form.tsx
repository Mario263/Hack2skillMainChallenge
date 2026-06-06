"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm({
  google,
  devLogin,
  callbackUrl,
}: {
  google: boolean;
  devLogin: boolean;
  callbackUrl: string;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setLoading("dev");
    const res = await signIn("dev-login", {
      email,
      redirect: false,
      callbackUrl,
    });
    setLoading(null);
    if (res?.error) toast.error("Could not sign in. Try again.");
    else window.location.href = res?.url ?? callbackUrl;
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10">
          <HeartPulse className="size-6 text-primary" aria-hidden />
        </div>
        <CardTitle as="h1" className="text-xl">
          Welcome to Mindful
        </CardTitle>
        <CardDescription>Sign in to track your wellness journey.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {google && (
          <Button
            className="w-full"
            variant="outline"
            disabled={loading !== null}
            onClick={() => {
              setLoading("google");
              void signIn("google", { callbackUrl });
            }}
          >
            {loading === "google" ? "Redirecting…" : "Continue with Google"}
          </Button>
        )}

        {google && devLogin && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        {devLogin && (
          <form onSubmit={handleDevLogin} className="space-y-3">
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-[--radius-md] border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" className="w-full" disabled={loading !== null}>
              {loading === "dev" ? "Signing in…" : "Continue with email (dev)"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Dev login is enabled for this environment — no password needed.
            </p>
          </form>
        )}

        {!google && !devLogin && (
          <p className="text-center text-sm text-muted-foreground">
            No sign-in method is configured. Set <code>AUTH_GOOGLE_ID</code> /
            <code>AUTH_GOOGLE_SECRET</code> or enable{" "}
            <code>ENABLE_DEV_LOGIN</code>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
