import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL =
  process.env.NEXT_PUBLIC_RESUME_AI_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/api/resume-builder/generate-summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    const message = data?.detail || data?.error || data?.message;

    if (!response.ok) {
      return NextResponse.json(
        { error: message || "Failed to generate summary versions." },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not reach the backend summary generation service." },
      { status: 502 },
    );
  }
}
