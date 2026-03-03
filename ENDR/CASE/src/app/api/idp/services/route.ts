import { NextRequest, NextResponse } from "next/server";

import { resolveApiBase } from "../../../lib/plex";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const endpoint = `${resolveApiBase()}/api/services`;

  try {
    const payload = await request.text();
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      body: payload
    });
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
      { detail: `unable to submit service request to ${endpoint}: ${detail}` },
      { status: 502 }
    );
  }
}
