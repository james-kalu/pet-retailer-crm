"use server";

import { redirect } from "next/navigation";

import { login, logout } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!login(password)) {
    redirect("/login?error=1");
  }

  redirect("/");
}

export async function logoutAction() {
  logout();
  redirect("/login");
}
