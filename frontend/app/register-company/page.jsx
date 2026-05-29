"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { registerCompany } from "@/lib/api";
import { getDashboardPath, getToken } from "@/lib/auth";

export default function RegisterCompanyPage() {
  const router = useRouter();
  const [form, setForm] = useState({ company_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (getToken()) {
      router.replace(getDashboardPath());
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const email = form.email.trim().toLowerCase();
    if (!email.endsWith("@aiproject.com")) {
      setError("Company email must end with @aiproject.com");
      return;
    }

    if (!form.company_name.trim()) {
      setError("Company name is required");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await registerCompany({
        company_name: form.company_name.trim(),
        email,
        password: form.password,
      });
      setSuccess("Company registered successfully! Redirecting to login...");
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell dark-grid-overlay min-h-screen bg-hero-pattern px-6 py-12 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-smooth">
        <h1 className="text-2xl font-semibold text-slateplus">Register as Company</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create a company account to post jobs and find candidates.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Only emails ending with <strong>@aiproject.com</strong> are accepted.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="company_name">
              Company Name
            </label>
            <input
              id="company_name"
              type="text"
              required
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="e.g. AI Solutions Inc."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
              Company Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@aiproject.com"
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
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          {success && (
            <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Registering..." : "Register Company"}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
