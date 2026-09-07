import { auth, authCapabilities, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  if ((await auth())?.user?.id) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Crush</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to your workspace</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Workspace access is granted from server-side membership records.
        </p>
        <div className="mt-8 grid gap-3">
          {authCapabilities.githubConfigured ? (
            <form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}>
              <button className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-100" type="submit">
                Continue with GitHub
              </button>
            </form>
          ) : null}
          {authCapabilities.developmentLoginEnabled ? (
            <form action={async () => { "use server"; await signIn("development", { redirectTo: "/" }); }}>
              <button className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-400" type="submit">
                Open local demo
              </button>
            </form>
          ) : null}
          {!authCapabilities.githubConfigured && !authCapabilities.developmentLoginEnabled ? (
            <p className="rounded-xl border border-amber-700 bg-amber-950/50 p-4 text-sm leading-6 text-amber-100">
              Authentication is not configured. Add the server-side Auth.js and database environment variables.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
