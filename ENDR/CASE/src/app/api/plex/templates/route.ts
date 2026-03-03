import { NextResponse } from "next/server";

import { resolveApiBase } from "../../../lib/plex";

export const dynamic = "force-dynamic";

export async function GET() {
  const endpoint = `${resolveApiBase()}/api/plex/templates`;

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { detail: `unable to load create options from ${endpoint}: ${detail}` },
      { status: 502 }
    );
  }
}
