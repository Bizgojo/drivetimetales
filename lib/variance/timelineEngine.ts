import { db } from "@/lib/db";

export async function buildTimeline(campaignId: string) {
  const logs = await db.query(
    `SELECT agent, event_type, event, details, created_at
     FROM agent_logs
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );

  return logs.rows.map((row: any) => ({
    label: ${row.agent}: ${row.event},
    timestamp: row.created_at
  }));
}
