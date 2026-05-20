import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import {
  authenticateCredentialsUser,
  BackendUserAuthError,
  syncAuthenticatedUser,
} from "@/lib/backend-user";

const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: {
          label: "שם משתמש או אימייל",
          type: "text",
        },
        password: {
          label: "סיסמה",
          type: "password",
        },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim() ?? "";
        const password = credentials?.password ?? "";

        if (!identifier || !password) {
          return null;
        }

        try {
          const backendUser = await authenticateCredentialsUser({
            identifier,
            password,
          });

          return {
            id: backendUser.id,
            email: backendUser.email,
            name: backendUser.name,
            role: backendUser.role,
          };
        } catch (error) {
          if (
            error instanceof BackendUserAuthError &&
            (error.status === 400 || error.status === 401)
          ) {
            return null;
          }

          throw error;
        }
      },
    }),
    ...(googleClientId && googleClientSecret
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "credentials" && user) {
        token.userId = user.id;
        token.name = user.name ?? null;
        token.email = user.email ?? "";
        token.role =
          user.role === "admin" || user.role === "staff" || user.role === "user"
            ? user.role
            : "user";
      }

      if (account?.provider === "google") {
        const email =
          typeof profile?.email === "string" ? profile.email : token.email;
        const name =
          typeof profile?.name === "string" ? profile.name : token.name ?? null;

        if (!email) {
          throw new Error("Google account did not provide an email address.");
        }

        let backendUser;

        try {
          backendUser = await syncAuthenticatedUser({
            email,
            name,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown backend sync error.";

          console.error("Google sign-in backend sync failed", {
            email,
            name,
            message,
          });

          throw new Error(`Failed to sync authenticated user: ${message}`);
        }

        token.userId = backendUser.id;
        token.name = backendUser.name ?? name;
        token.email = backendUser.email;
        token.role = backendUser.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === "string" ? token.userId : "";
        session.user.email = token.email ?? session.user.email ?? "";
        session.user.name =
          typeof token.name === "string" ? token.name : session.user.name;
        session.user.role =
          token.role === "admin" || token.role === "staff" || token.role === "user"
            ? token.role
            : "user";
      }

      return session;
    },
  },
};
