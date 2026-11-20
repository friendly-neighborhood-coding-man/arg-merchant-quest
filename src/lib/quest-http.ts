import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCampaignBySlug } from "@/lib/store";
import { PLAYER_COOKIE } from "@/lib/quest-store";

/**
 * Small helpers shared by the quest API routes. The player identity is an
 * anonymous cookie — this build has no accounts, by design.
 */
export async function readPlayerId(): Promise<string | null> {
  const store = await cookies();
  return store.get(PLAYER_COOKIE)?.value ?? null;
}

export function isPlayerId(value: string): boolean {
  return /^plr_[0-9a-f-]{36}$/i.test(value);
}

export async function loadCampaign(slug: string) {
  return getCampaignBySlug(slug);
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export function playerCookieResponse(body: Record<string, unknown>, playerId?: string) {
  const response = NextResponse.json(body);
  if (playerId) {
    response.cookies.set({
      name: PLAYER_COOKIE,
      value: playerId,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
  }
  return response;
}
