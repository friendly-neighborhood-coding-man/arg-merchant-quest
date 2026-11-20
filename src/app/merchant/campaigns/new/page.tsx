import Link from "next/link";
import type { Metadata } from "next";
import { CampaignForm } from "@/components/campaign-form";
import { getDemoMerchant } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New campaign",
  description: "Create an ARG campaign with online and in-store clues.",
};

export default function NewCampaignPage() {
  const merchant = getDemoMerchant();

  return (
    <div className="wrap space-y-7 pt-8">
      <div>
        <Link href="/merchant" className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← Campaign desk
        </Link>
      </div>

      <header className="max-w-2xl">
        <p className="mono-label">New campaign</p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-white sm:text-4xl">
          Build one trail
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-sage/75">
          A campaign is a shop, a story, an online trail, and one object a visitor can find in 3–5
          minutes. Keep it solvable, keep the reward fixed, and show the coupon conditions honestly.
        </p>
      </header>

      <CampaignForm merchantName={merchant.name} />
    </div>
  );
}
