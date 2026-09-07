import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

import { getDatabasePool, hasDatabaseConfiguration } from "./lib/database.ts";
import { isDevelopmentTenantMode } from "./lib/tenant-repository.ts";

const githubConfigured = Boolean(
  process.env.AUTH_GITHUB_ID?.trim() && process.env.AUTH_GITHUB_SECRET?.trim(),
);
const developmentLoginEnabled = isDevelopmentTenantMode();
const databaseConfigured = hasDatabaseConfiguration();

const providers = [
  ...(githubConfigured
    ? [GitHub({
        clientId: process.env.AUTH_GITHUB_ID!,
        clientSecret: process.env.AUTH_GITHUB_SECRET!,
      })]
    : []),
  ...(developmentLoginEnabled
    ? [Credentials({
        id: "development",
        name: "Development demo",
        credentials: {},
        authorize() {
          return { id: "dev-user", name: "Local Demo User", email: "demo@localhost.invalid" };
        },
      })]
    : []),
];

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...(databaseConfigured ? { adapter: PostgresAdapter(getDatabasePool()) } : {}),
  providers,
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt" },
  trustHost: process.env.NODE_ENV !== "production" ||
    process.env.AUTH_TRUST_HOST === "true" ||
    Boolean(process.env.VERCEL),
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = String(user.id);
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    authorized({ auth: session }) {
      return Boolean(session?.user?.id);
    },
  },
});

export const authCapabilities = Object.freeze({ developmentLoginEnabled, githubConfigured });
