import { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: "admin" | "staff" | "user";
  }

  interface Session {
    user: {
      id: string;
      role: "admin" | "staff" | "user";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: "admin" | "staff" | "user";
  }
}
