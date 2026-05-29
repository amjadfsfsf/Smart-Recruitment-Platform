"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { signIn } from "@/lib/api";
import { getDashboardPath, getToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getToken()) {
      router.replace(getDashboardPath());
    }
  }, [router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await signIn(form);

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      const role = data.user?.role || "user";
      router.replace(role === "company" ? "/company-dashboard" : "/dashboard/job-matching");
    } catch (submitError) {
      setError(submitError.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell dark-grid-overlay min-h-screen bg-hero-pattern px-6 py-12 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-smooth">
        <h1 className="text-2xl font-semibold text-slateplus">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">Login to continue with Smart Recruitment Platform.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="text"
              inputMode="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-500">
          New here?{" "}
          <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </p>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <Link
            href="/register-company"
            className="block w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-200 transition hover:bg-brand-100"
          >
            Register as Company
          </Link>
        </div>
      </div>
    </main>
  );
}
