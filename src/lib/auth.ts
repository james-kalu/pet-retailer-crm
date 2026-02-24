import crypto from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "petcrm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function appPassword(): string {
  return process.env.APP_PASSWORD ?? "petcrm";
}

function sessionToken(): string {
  return crypto.createHash("sha256").update(`${appPassword()}::petcrm`).digest("hex");
}

export function isAuthenticated(): boolean {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token === sessionToken();
}

export function requireAuth(): void {
  if (!isAuthenticated()) {
    redirect("/login");
  }
}

export function redirectIfAuthenticated(): void {
  if (isAuthenticated()) {
    redirect("/");
  }
}

export function login(password: string): boolean {
  if (password !== appPassword()) {
    return false;
  }

  cookies().set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/"
  });

  return true;
}

export function logout(): void {
  cookies().delete(SESSION_COOKIE);
}
