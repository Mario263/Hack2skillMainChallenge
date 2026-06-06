import { redirect } from "next/navigation";
import { auth, authProviderStatus } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const target = callbackUrl ?? "/dashboard";

  if (session?.user) redirect(target);

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex justify-end p-5">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 pb-20">
        <LoginForm
          google={authProviderStatus.google}
          devLogin={authProviderStatus.devLogin}
          callbackUrl={target}
        />
      </div>
    </main>
  );
}
