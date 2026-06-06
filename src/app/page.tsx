import Link from "next/link";
import { HeartPulse, LineChart, NotebookPen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  {
    icon: HeartPulse,
    title: "Mood & stress tracking",
    body: "Log how you feel in seconds with a calm, low-effort interface.",
  },
  {
    icon: NotebookPen,
    title: "Private journaling",
    body: "Write freely with autosave and offline support — your space, always.",
  },
  {
    icon: Sparkles,
    title: "AI wellness insights",
    body: "Personalized, non-clinical guidance and gentle burnout warnings.",
  },
  {
    icon: LineChart,
    title: "Trends & analytics",
    body: "See mood trends, triggers, and your weekly wellness score.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <HeartPulse className="size-5 text-primary" aria-hidden />
          Mindful
        </span>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login">
            <Button size="sm" variant="outline">
              Sign in
            </Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-5 pt-12 pb-10 text-center">
        <p className="mb-3 text-sm font-medium text-primary">
          Built for NEET · JEE · UPSC · CAT · GATE · CUET · Boards
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Protect your mind while you chase the rank.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Mindful helps students manage burnout, anxiety, and academic pressure
          with mood tracking, journaling, and AI-powered wellness insights —
          working even when your connection doesn&apos;t.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/login">
            <Button size="lg">Get started — it&apos;s free</Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="outline">
              Open dashboard
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-5 pb-20 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <CardContent className="flex gap-4 pt-6">
              <f.icon className="size-6 shrink-0 text-primary" aria-hidden />
              <div>
                <h2 className="font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Mindful is a self-help tool, not a substitute for professional care. In
        crisis? In India, call Tele-MANAS at 14416.
      </footer>
    </main>
  );
}
