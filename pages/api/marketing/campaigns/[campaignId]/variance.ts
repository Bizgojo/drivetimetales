import type { NextApiRequest, NextApiResponse } from "next";
import { getCampaignVariance } from "@/lib/variance/varianceService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { campaignId } = req.query;

  if (!campaignId || typeof campaignId !== "string") {
    return res.status(400).json({ error: "Missing campaignId" });
  }

  try {
    const variance = await getCampaignVariance(campaignId);
    res.status(200).json(variance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute variance" });
  }
}
