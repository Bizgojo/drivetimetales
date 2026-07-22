# Susan Marketing API — Usage Guide

> **For Susan (Endless Tales Marketing Agent)**
> Read-only proxy endpoints for Meta and TikTok campaign performance data.
> You never touch the real credentials. They live server-side only.

---

## Authentication

Every request must include your Susan API key. Two ways:

**Option 1 — Header (preferred):**
```
x-susan-api-key: d7899f0b5ce069940da7142ce5ffe556e62259fd90045e59aa386c0019200b69
```

**Option 2 — Bearer token:**
```
Authorization: Bearer d7899f0b5ce069940da7142ce5ffe556e62259fd90045e59aa386c0019200b69
```

Your token is `SUSAN_MARKETING_TOKEN` in `.env.local`. Marc controls it.

---

## Endpoint 1: Meta Ads Insights

```
GET /api/marketing/meta-insights
```

### Required params
| Param | Description |
|---|---|
| `campaign_id` | Meta campaign ID (e.g. `120200000123456789`) |

### Optional params
| Param | Default | Description |
|---|---|---|
| `date_preset` | `last_7d` | `last_7d`, `last_14d`, `last_30d`, `last_month`, `this_month` |
| `fields` | impressions,clicks,spend,reach,ctr,cpc,cpm,conversions,purchase_roas | Comma-separated Meta Ads fields |
| `ad_account_id` | from server env | Override the ad account (rarely needed) |

### Example
```bash
curl "https://www.drivetimetales.com/api/marketing/meta-insights?campaign_id=120200000123456789&date_preset=last_7d" \
  -H "x-susan-api-key: d7899f0b5ce069940da7142ce5ffe556e62259fd90045e59aa386c0019200b69"
```

### Response shape
```json
{
  "source": "meta",
  "campaign_id": "120200000123456789",
  "date_preset": "last_7d",
  "fields": "impressions,clicks,spend,reach,ctr,cpc,cpm,conversions,purchase_roas",
  "data": [
    {
      "impressions": "15234",
      "clicks": "412",
      "spend": "184.56",
      "reach": "11200",
      "ctr": "2.704",
      "cpc": "0.448",
      "cpm": "12.11",
      "conversions": "23",
      "purchase_roas": [{ "action_type": "omni_purchase", "value": "3.82" }]
    }
  ],
  "paging": { "cursors": { "before": "...", "after": "..." } },
  "fetched_at": "2026-07-22T12:00:00.000Z"
}
```

---

## Endpoint 2: TikTok Ads Insights

```
GET /api/marketing/tiktok-insights
```

### Required params
| Param | Description |
|---|---|
| `campaign_id` | TikTok campaign ID |

### Optional params
| Param | Default | Description |
|---|---|---|
| `date_range` | `last_7d` | `last_7d`, `last_14d`, `last_30d`, `last_month`, `this_month` |
| `start_date` | auto from date_range | YYYY-MM-DD (use with `end_date` for custom range) |
| `end_date` | auto from date_range | YYYY-MM-DD |
| `fields` | campaign_name,spend,impressions,clicks,ctr,cpc,cpm,conversion,cost_per_result,reach,frequency | Comma-separated metrics |
| `advertiser_id` | from server env | Override advertiser (rarely needed) |

### Example
```bash
curl "https://www.drivetimetales.com/api/marketing/tiktok-insights?campaign_id=1234567890&date_range=last_14d" \
  -H "x-susan-api-key: d7899f0b5ce069940da7142ce5ffe556e62259fd90045e59aa386c0019200b69"
```

### Response shape
```json
{
  "source": "tiktok",
  "campaign_id": "1234567890",
  "date_range": "last_14d",
  "start_date": "2026-07-08",
  "end_date": "2026-07-22",
  "metrics": ["campaign_name", "spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversion", "cost_per_result", "reach", "frequency"],
  "data": [
    {
      "dimensions": { "campaign_id": "1234567890", "stat_time_day": "2026-07-21 00:00:00" },
      "metrics": { "spend": "42.10", "impressions": "8200", "clicks": "310", "ctr": "3.78" }
    }
  ],
  "page_info": { "total_number": 14, "page_size": 100 },
  "fetched_at": "2026-07-22T12:00:00.000Z"
}
```

---

## Error Responses

| Status | `error` field | Meaning |
|---|---|---|
| `401` | `UNAUTHORIZED` | Missing or wrong API key |
| `400` | `MISSING_PARAM` | Required param not provided |
| `503` | `META_CREDENTIALS_NOT_CONFIGURED` | Marc hasn't added Meta env vars yet |
| `503` | `TIKTOK_CREDENTIALS_NOT_CONFIGURED` | Marc hasn't added TikTok env vars yet |
| `502` | `META_FETCH_ERROR` / `TIKTOK_FETCH_ERROR` | Network error reaching the ad API |
| `422` | `TIKTOK_API_ERROR` | TikTok returned a non-zero error code |

503 responses include a `missing` array listing exactly which env vars Marc needs to add,
plus a `docs` URL.

---

## What You Can and Cannot Do

✅ **You CAN:**
- Pull impressions, clicks, spend, reach, CTR, CPC, CPM, conversions, ROAS
- Query any campaign by ID
- Use date presets or custom date ranges
- Request a subset of fields

❌ **You CANNOT (by design):**
- Create, modify, or delete campaigns
- Spend money
- Access personal/PII data (email, phone, etc. are stripped at the proxy)
- Use any other Meta or TikTok API endpoints

---

## Environment Variables Marc Needs to Add

### Meta Ads
| Variable | Where to get it |
|---|---|
| `META_ACCESS_TOKEN` | Meta Business Manager → System Users → Generate token with `ads_read` permission |
| `META_AD_ACCOUNT_ID` | Meta Business Manager → Ad Accounts → Account ID (format: `act_XXXXXXXX`) |

**Minimum required Meta permissions:** `ads_read` (NOT `ads_management`)

### TikTok Ads
| Variable | Where to get it |
|---|---|
| `TIKTOK_ACCESS_TOKEN` | TikTok Marketing API → App → Generate Long-Term Access Token with `Reporting` scope |
| `TIKTOK_ADVERTISER_ID` | TikTok Ads Manager → Account Info |

**Minimum required TikTok scope:** `Reporting` (NOT Campaign Management)

Both variables need to be added to:
1. `.env.local` (for local dev)
2. Vercel project environment variables (for production)

---

*Last updated: 2026-07-22 | Branch: feat/susan-api-token-001*
