import { NextRequest, NextResponse } from "next/server";

import { resolveApiBase } from "../../../lib/plex";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const endpoint = `${resolveApiBase()}/api/plex/history`;
  const query = request.nextUrl.searchParams.toString();
  const url = query ? `${endpoint}?${query}` : endpoint;

  try {
    const response = await fetch(url, { cache: "no-store" });
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
      { detail: `unable to load CASE history from ${url}: ${detail}` },
      { status: 502 }
    );
  }
}
