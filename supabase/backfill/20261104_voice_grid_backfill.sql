-- VOICE GRID BACKFILL — 2026-11-04 (commission voice-grid-20261104)
-- ⚠️  DO NOT RUN against production until:
--   1) migration supabase/migrations/20261104190000_voice_grid.sql is applied, and
--   2) Don has approved. Idempotent: all UPDATEs keyed on elevenlabs_voice_id.
-- Source: live narrator_voices snapshot 2026-11-04 (~13:20 EST), 108 rows (107 active + 1 retired).
-- voice_code for 50 NULL rows follows the LIVE pattern NR-{G}-{A}-{T}-{CC}-Vn,
-- ordered by created_at ASC; Vn bumped on collision. Derivation:
--   G: female FE / male MA / neutral NE; A: adult AD / young YO / middle_aged M4 / old L5;
--   T: first tone word mapped (warm WM, calm CL, neutral NT, dark DK, deep DE, cool/commanding/composed CO,
--      observant OB, grounded GD, measured ME, bright BR, natural NA, dry DR, ...);
--   CC: american/southern/us-southern/florida/african-american/new-york US; british UK; german DE; australian AU; indian IN.
-- source: custom = present in ElevenLabs account library (79 rows); library = not in account (29 rows).
--   "default" value reserved for Dons original-71/72 designation — reclassify after his OK.

-- ── 1. voice_code for the 50 NULL rows ──
UPDATE narrator_voices SET voice_code = 'NR-MA-AD-DR-US-V1' WHERE elevenlabs_voice_id = 'SZerLwGb1NeK3eR4hrh6' AND voice_code IS NULL; -- Wade Gentry
UPDATE narrator_voices SET voice_code = 'NR-MA-AD-WM-UK-V1' WHERE elevenlabs_voice_id = 'mHlts5QHKpF8NPCOjcgW' AND voice_code IS NULL; -- Harry
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-CO-UK-V1' WHERE elevenlabs_voice_id = 'O11m50SZJXmCRtJubOuL' AND voice_code IS NULL; -- Nell
UPDATE narrator_voices SET voice_code = 'NR-MA-YO-OB-US-V1' WHERE elevenlabs_voice_id = 'Pb8RZcHs3ga4StE7wiPM' AND voice_code IS NULL; -- Ethan
UPDATE narrator_voices SET voice_code = 'NR-MA-AD-CL-DE-V1' WHERE elevenlabs_voice_id = 'fvmkmNaIvqNTpXkcg7GK' AND voice_code IS NULL; -- Bernd
UPDATE narrator_voices SET voice_code = 'NR-MA-AD-GD-AU-V1' WHERE elevenlabs_voice_id = 'jSuBIjxMKhqIfb0wCK1F' AND voice_code IS NULL; -- Baxter
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-CL-US-V1' WHERE elevenlabs_voice_id = 'ovUpRQCoNYADjai0c9kP' AND voice_code IS NULL; -- Mara Vance
UPDATE narrator_voices SET voice_code = 'NR-MA-AD-WM-US-V4' WHERE elevenlabs_voice_id = 'lrNW0BJYfUIVVt3VDdUy' AND voice_code IS NULL; -- Aiden
UPDATE narrator_voices SET voice_code = 'NR-MA-M4-ME-US-V1' WHERE elevenlabs_voice_id = 'gOupLcAkjEnguROwi4oS' AND voice_code IS NULL; -- Cole
UPDATE narrator_voices SET voice_code = 'NR-FE-AD-WM-US-V6' WHERE elevenlabs_voice_id = '3dBvD0E5FtlvoRbqhcbM' AND voice_code IS NULL; -- ET Barbara
UPDATE narrator_voices SET voice_code = 'NR-MA-AD-ME-US-V1' WHERE elevenlabs_voice_id = 'RckSZHfvva0yOVRPzRfv' AND voice_code IS NULL; -- Arlo
UPDATE narrator_voices SET voice_code = 'NR-FE-AD-CO-US-V1' WHERE elevenlabs_voice_id = 'esy0r39YPLQjOczyOib8' AND voice_code IS NULL; -- Brittney
UPDATE narrator_voices SET voice_code = 'NR-FE-AD-CO-US-V2' WHERE elevenlabs_voice_id = 'Qin2NRfiKVQMJLxnoZaY' AND voice_code IS NULL; -- Athena
UPDATE narrator_voices SET voice_code = 'NR-MA-AD-BR-US-V1' WHERE elevenlabs_voice_id = 'bIHbv24MWmeRgasZH58o' AND voice_code IS NULL; -- Will
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-NA-US-V1' WHERE elevenlabs_voice_id = '1rnYMVDXZksVr6x7pZPX' AND voice_code IS NULL; -- Veda Sky - Suspense & Horror Storyteller
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V1' WHERE elevenlabs_voice_id = 'cauGUrZQIRUvQs3glrUi' AND voice_code IS NULL; -- Kai - Warm Southern Woman
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V2' WHERE elevenlabs_voice_id = 'FNhoq0qHG3T8YOWzBtd6' AND voice_code IS NULL; -- Allison - Cowgirl with a Southern Accent
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-NA-UK-V1' WHERE elevenlabs_voice_id = 'L39mCFEANiRSjBYTGelY' AND voice_code IS NULL; -- Anna - British Neutral Narration
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V3' WHERE elevenlabs_voice_id = 'TfVjIROhkRShQb9pCFfK' AND voice_code IS NULL; -- Josie - Southern, Smooth and Sultry
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V4' WHERE elevenlabs_voice_id = 'wxlw6ulIrrWVbeIh6Jut' AND voice_code IS NULL; -- Grace - Honey-Smooth Southern Drawl
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V5' WHERE elevenlabs_voice_id = 'iVwieylcLv7bwfinSNdw' AND voice_code IS NULL; -- Louise - Clear, calm, thoughtful
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V6' WHERE elevenlabs_voice_id = 'Bk8cLrXXi9WCZ4GQU4Ah' AND voice_code IS NULL; -- Clara Louise - Clear, intimate, warm
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V7' WHERE elevenlabs_voice_id = '6j8uSqQkZH2WrWDVIiRB' AND voice_code IS NULL; -- Luna - Late Night Sweetheart
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-IN-V1' WHERE elevenlabs_voice_id = 'NL5yDL1ccYeWsAKmxP3r' AND voice_code IS NULL; -- Diana - Spicy Fantasy Romance Narrator
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V8' WHERE elevenlabs_voice_id = 'QzgYVYSNBgksoEWDkpKt' AND voice_code IS NULL; -- Amanda Beans - Kind, Quirky and Hearfelt
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-US-V9' WHERE elevenlabs_voice_id = '7kTHQRfmpeNlB1V4xfvV' AND voice_code IS NULL; -- Valerie - Sultry, Seductive, Romantic
UPDATE narrator_voices SET voice_code = 'NR-FE-YO-WM-UK-V1' WHERE elevenlabs_voice_id = 'Xu3wSNsJpZX7XVk3w9yS' AND voice_code IS NULL; -- Leona G – Soothing Voice for Fiction & Romance Audiobooks
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-DE-US-V1' WHERE elevenlabs_voice_id = 'YXpFCvM1S3JbWEJhoskW' AND voice_code IS NULL; -- Wyatt- Wise Rustic Cowboy
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-WM-UK-V1' WHERE elevenlabs_voice_id = '0lp4RIz96WD1RUtvEu3Q' AND voice_code IS NULL; -- Grandfather Joe -  Gentle, warm & wise
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-WM-US-V2' WHERE elevenlabs_voice_id = 'y2Y5MeVPm6ZQXK64WUui' AND voice_code IS NULL; -- The Pharaoh  - Wisdom Bearer
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-NA-US-V1' WHERE elevenlabs_voice_id = 'MKlLqCItoCkvdhrxgtLv' AND voice_code IS NULL; -- Grampa Werthers - Old & Cranky
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-NA-US-V2' WHERE elevenlabs_voice_id = '0hh7H4ZVAtaGpm1VZyEN' AND voice_code IS NULL; -- David - Deep, Southern, Cowboy
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-WM-US-V3' WHERE elevenlabs_voice_id = 'PerZoH0r6nxBZXCoIPpv' AND voice_code IS NULL; -- Michael Moody - Grandfatherly warm and deep
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-WM-US-V4' WHERE elevenlabs_voice_id = 'bRlp5mUWs01wX4H4oW4X' AND voice_code IS NULL; -- Frank Sullivan - Warm & Authentic
UPDATE narrator_voices SET voice_code = 'NR-MA-L5-DE-UK-V1' WHERE elevenlabs_voice_id = 'htZQqY7WtacRNV7s62Iy' AND voice_code IS NULL; -- Daniel - The Gruff Old British Wizard
UPDATE narrator_voices SET voice_code = 'NR-FE-L5-NA-US-V1' WHERE elevenlabs_voice_id = 'wGcFBfKz5yUQqhqr0mVy' AND voice_code IS NULL; -- Maria Moody - Grandmotherly Storykeeper
UPDATE narrator_voices SET voice_code = 'NR-FE-L5-WM-US-V1' WHERE elevenlabs_voice_id = 'A0g6t0RQc9zkMPsGNEIG' AND voice_code IS NULL; -- Grandma Maria
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-WM-UK-V1' WHERE elevenlabs_voice_id = '1hlpeD1ydbI2ow0Tt3EW' AND voice_code IS NULL; -- Verity X - Calm British Narration
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-WM-UK-V2' WHERE elevenlabs_voice_id = 'iBo5PWT1qLiEyqhM7TrG' AND voice_code IS NULL; -- Liberty X - Transatlantic Global Narration
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-DE-US-V1' WHERE elevenlabs_voice_id = 'Z5JpFCNFIz8Nhe4KEikq' AND voice_code IS NULL; -- Kelli LaShae - Warm Southern Narrator
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-WM-US-V2' WHERE elevenlabs_voice_id = 'M8391pS6bItq6N4ptCRa' AND voice_code IS NULL; -- Eden - Warm tone storyteller
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-NA-UK-V1' WHERE elevenlabs_voice_id = 'GsjQ0ydx7QzhDLqInGtT' AND voice_code IS NULL; -- Olivia - Suspenseful, British and Calm
UPDATE narrator_voices SET voice_code = 'NR-FE-M4-WM-US-V3' WHERE elevenlabs_voice_id = 'G5ZnbSWZOwppzVTp0uTm' AND voice_code IS NULL; -- Danielle - Warm Southern Storyteller
UPDATE narrator_voices SET voice_code = 'NR-MA-YO-WM-US-V2' WHERE elevenlabs_voice_id = 'lMILJ9d29MrRXy9BIgcz' AND voice_code IS NULL; -- Christian - Romance Narrator
UPDATE narrator_voices SET voice_code = 'NR-MA-YO-DE-US-V1' WHERE elevenlabs_voice_id = 'jD4PjnscE4XmlzgsuqY0' AND voice_code IS NULL; -- Logan - Genuine, Steady, and Deep
UPDATE narrator_voices SET voice_code = 'NR-MA-M4-DE-UK-V1' WHERE elevenlabs_voice_id = 'mfxPGiKweaQEsXJix2Ve' AND voice_code IS NULL; -- Zane - Deep, Captivating and Dramatic
UPDATE narrator_voices SET voice_code = 'NR-MA-M4-WM-UK-V1' WHERE elevenlabs_voice_id = 'QRcumt9oV9EP5UgzLrFK' AND voice_code IS NULL; -- Nathaniel - Romantic, Round and Sensual
UPDATE narrator_voices SET voice_code = 'NR-MA-M4-DE-US-V1' WHERE elevenlabs_voice_id = '7FroLDTDG92jPfUW6BlQ' AND voice_code IS NULL; -- John Texas - Deep and Smooth Narrator
UPDATE narrator_voices SET voice_code = 'NR-MA-M4-WM-UK-V2' WHERE elevenlabs_voice_id = 'lo1O1Dz1Tu4FWVEPaxuT' AND voice_code IS NULL; -- Oliver - Warm British Narrator
UPDATE narrator_voices SET voice_code = 'NR-MA-YO-WM-US-V3' WHERE elevenlabs_voice_id = 'L7tnZ2Iaul3XxXEBVYoz' AND voice_code IS NULL; -- Wesley – Southern, Warm, Conversational

-- ── 2. sample_url from ElevenLabs preview_url where missing (70 rows) ──
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3' WHERE elevenlabs_voice_id = 'XrExE9yKIg1WjnnlVkGX' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/IRHApOXLvnW57QJPQH2P/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ1c2VyX2lkIjoiNEdXZzBVd1FLWGJpVkZPMFRybDRqTURTVGI4MiIsImZpbGVuYW1lIjoiNzc1ODgyMmYtYzk4Yy00ZGI5LWFiMGEtMTg2YjZhMTNiZTFhLm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'IRHApOXLvnW57QJPQH2P' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/jQKNVOWM9XL57z7bMalU/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ1c2VyX2lkIjoiZWJ3cTlKVGJIaE50YkMwWkxmbTNXR2NRTWxQMiIsImZpbGVuYW1lIjoiNnREdjJyQ1Q0WGxLbExjMnA4aDMubXAzIiwidGltZXN0YW1wIjoxNzkzODE1MjAwMDAwMDAwfQ%3D%3D' WHERE elevenlabs_voice_id = 'jQKNVOWM9XL57z7bMalU' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3' WHERE elevenlabs_voice_id = 'hpp4J3VqNfWAUOO0d1Us' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3' WHERE elevenlabs_voice_id = 'SOYHLrjzK2X1ezoPC6cr' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3' WHERE elevenlabs_voice_id = 'N2lVS1w4EtoT3dr4eOWO' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/15f2ab26833d4bcba0261890ff904f88/voices/IKuPqyuiEnnZFcU4OVzH/7BylfhJe3KEjmEv7vvL1.mp3' WHERE elevenlabs_voice_id = 'IKuPqyuiEnnZFcU4OVzH' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3' WHERE elevenlabs_voice_id = 'cgSgspJ2msm6clMCkdW9' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/CwhRBWXzGAHq8TQ4Fs17/58ee3ff5-f6f2-4628-93b8-e38eb31806b0.mp3' WHERE elevenlabs_voice_id = 'CwhRBWXzGAHq8TQ4Fs17' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/FGY2WhTYpPnrIDTdsKH5/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiI2NzM0MTc1OS1hZDA4LTQxYTUtYmU2ZS1kZTEyZmU0NDg2MTgubXAzIiwidGltZXN0YW1wIjoxNzkzODE1MjAwMDAwMDAwfQ%3D%3D' WHERE elevenlabs_voice_id = 'FGY2WhTYpPnrIDTdsKH5' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3' WHERE elevenlabs_voice_id = 'cjVigY5qzO86Huf0OWal' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SAz9YHcvj6GT2YYXdXww/e6c95f0b-2227-491a-b3d7-2249240decb7.mp3' WHERE elevenlabs_voice_id = 'SAz9YHcvj6GT2YYXdXww' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/nPczCjzI2devNBz1zQrb/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiIyZGQzZTcyYy00ZmQzLTQyZjEtOTNlYS1hYmM1ZDRlNWFhMWQubXAzIiwidGltZXN0YW1wIjoxNzkzODE1MjAwMDAwMDAwfQ%3D%3D' WHERE elevenlabs_voice_id = 'nPczCjzI2devNBz1zQrb' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/ZmqEPiBIr4itJeB29TyD/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiI1MjA5OWEyN2U4NTU0NDkzYjRkNjY3MTAyMzc2ZDYzNCIsImZpbGVuYW1lIjoiekRNY0hXVE5RbEx0TzdhUWE1bGsubXAzIiwidGltZXN0YW1wIjoxNzkzODE1MjAwMDAwMDAwfQ%3D%3D' WHERE elevenlabs_voice_id = 'ZmqEPiBIr4itJeB29TyD' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/aQ3vv2wCbTCVUwH4ESOO/1ac55616-1424-48c6-9e7a-485206d77e05.mp3' WHERE elevenlabs_voice_id = 'aQ3vv2wCbTCVUwH4ESOO' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/6c522b5bfec84de495109aec82523ef7/voices/yI0BY0SdffEkqmjTOUFc/d3111d89-9753-46b8-a1b2-b7dfdf1bdaa5.mp3' WHERE elevenlabs_voice_id = 'yI0BY0SdffEkqmjTOUFc' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/60df5e8e85434c87b586860524fe605c/voices/lWDDHwXsJXJM7nv2YgHY/Lb8lAfD4jzHnTpEzhixi.mp3' WHERE elevenlabs_voice_id = 'lWDDHwXsJXJM7nv2YgHY' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/e2c52f9641c54df8b869fd5d3c9ce4f4/voices/hA4zGnmTwX2NQiTRMt7o/QOnjpHcGLd6v1isrcubk.mp3' WHERE elevenlabs_voice_id = 'hA4zGnmTwX2NQiTRMt7o' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/e6cde72f646e49ffa3964f943b2814cf/voices/qSR2T7SqN7Pcd0YpO3Vd/eCZE7VA6HJ4jTB6wLsw3.mp3' WHERE elevenlabs_voice_id = 'qSR2T7SqN7Pcd0YpO3Vd' AND sample_url IS NULL;
-- NO PREVIEW AVAILABLE for Katherine Bell (NtS6nEHDYMQC9QczMQuq) — sample_url stays NULL
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/v9LgF91V36LGgbLX3iHW/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ1c2VyX2lkIjoiYVFjR29takhORVM3OW9neWtKUHJFMlZIMGE2MiIsImZpbGVuYW1lIjoicDREbTM5aVNRaFc1ZGE0bGxIaVoubXAzIiwidGltZXN0YW1wIjoxNzkzODE1MjAwMDAwMDAwfQ%3D%3D' WHERE elevenlabs_voice_id = 'v9LgF91V36LGgbLX3iHW' AND sample_url IS NULL;
-- NO PREVIEW AVAILABLE for Blair Rose (E819nNJEjUWvUHA3lfDl) — sample_url stays NULL
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/custom/voices/TbEd6wZh117FdOyTGS3q/SIW7ta30LSIVS992Z7hs.mp3' WHERE elevenlabs_voice_id = 'TbEd6wZh117FdOyTGS3q' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/oRs8PdnFAUhXes30NKDT/23c54c47-cb85-4ac9-9fe2-31ad3dffba38.mp3' WHERE elevenlabs_voice_id = 'oRs8PdnFAUhXes30NKDT' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/64ZIZpnfEIjUuIyw3uKc/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiMjllN2Y4MjEtOGYxYS00ZTg5LTk3YWEtMTFmNmM0MGNjOGQ0Lm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = '64ZIZpnfEIjUuIyw3uKc' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/9hGxRHDrJPVBk2ipyuuk/b31b9e24-22ec-4b08-a7b5-8d13269d055e.mp3' WHERE elevenlabs_voice_id = '9hGxRHDrJPVBk2ipyuuk' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/qvosafgNfYIPsgDOIotN/39625232-bfbb-49d8-8ddf-54728d492b7d.mp3' WHERE elevenlabs_voice_id = 'qvosafgNfYIPsgDOIotN' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/Bx6E7XGop7E6X9OCwIyh/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiZWY2YzI1ZWEtMThiNy00MjRkLTlhMzktNzgyNDVhMThmMzc1Lm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'Bx6E7XGop7E6X9OCwIyh' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/qD9ofb9chWh4dfRCWMPx/5f621952-715f-43ff-a2d6-cfa6ece80155.mp3' WHERE elevenlabs_voice_id = 'qD9ofb9chWh4dfRCWMPx' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/DgL4aqeif7j5vXmFZCtm/5caad78c-ef38-4836-933b-67297d3b17d2.mp3' WHERE elevenlabs_voice_id = 'DgL4aqeif7j5vXmFZCtm' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/uYhHpSFNoyh13x7mzmxh/b5b0406e-a2e0-4aaf-8006-fae99f2aa1d5.mp3' WHERE elevenlabs_voice_id = 'uYhHpSFNoyh13x7mzmxh' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/fXyxAavMrsCdaI4F1nfo/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiYjRkMGI5OTgtYmVlMS00ZDcwLWFiNjUtNWU0MTc2NWQyNGU5Lm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'fXyxAavMrsCdaI4F1nfo' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/IUhCu3b4pGewXKWMYl4x/0e252da9-c1c6-495a-bd3d-e6fde7aadb1d.mp3' WHERE elevenlabs_voice_id = 'IUhCu3b4pGewXKWMYl4x' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/zAQ1LDstS09AHR0ofagw/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiY2ZkOGYyOWEtOTRkMy00ODQ1LTg1YWItYWM5NTc3ZjEzZjQwLm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'zAQ1LDstS09AHR0ofagw' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/fZAt42eVuCC3sGVb7L7E/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiZDJkNGEyNTgtMjE2ZS00OWU1LWE5NTMtYWM5MjljZjQxOWEyLm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'fZAt42eVuCC3sGVb7L7E' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/WAyRKxPYHcG6u7yB1woY/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiNzA1NmQzMzMtMTEzNS00YTZjLTkzYTEtZmNiMDRlMTZjMjJmLm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'WAyRKxPYHcG6u7yB1woY' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/7vcAfiAL1LP6cgdQF51s/e49122ac-9199-4748-800d-fa687aa000df.mp3' WHERE elevenlabs_voice_id = '7vcAfiAL1LP6cgdQF51s' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/b4xC7oVqnoQHjp1TmJAF/5416ce44-84bb-40ee-8f0e-54c1a02a483f.mp3' WHERE elevenlabs_voice_id = 'b4xC7oVqnoQHjp1TmJAF' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/28N9BmQmmLh1arPTAAqW/aca56806-c070-4bac-a580-bb2e279e5cd5.mp3' WHERE elevenlabs_voice_id = '28N9BmQmmLh1arPTAAqW' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/7eosGqyFqolpQapMkYEz/79cb999f-3587-4364-8bff-562843bd3e44.mp3' WHERE elevenlabs_voice_id = '7eosGqyFqolpQapMkYEz' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/k64C4NILG34yJeeFwKgK/7fc46298-30af-4747-bb72-bece5c601c25.mp3' WHERE elevenlabs_voice_id = 'k64C4NILG34yJeeFwKgK' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/GUtvmpvjSsoZlvjTKGXi/97e0bf78-41c9-42ae-a446-ffd66319ad1a.mp3' WHERE elevenlabs_voice_id = 'GUtvmpvjSsoZlvjTKGXi' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/an8Hknyh1gi20hTRQ3XU/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiMDVlMTY0NjYtMGQxNi00YTk1LWEzMTItMjk4MzVkYTM5NWU5Lm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'an8Hknyh1gi20hTRQ3XU' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/kAYYFAgDr7733PWV6mKe/d25a1462-330c-4dd5-b6de-3b44e797e73b.mp3' WHERE elevenlabs_voice_id = 'kAYYFAgDr7733PWV6mKe' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/LZVDFbYLTcl0GkxDmyWe/d50adc40-c3ee-4b37-a94f-2d7f2edf0883.mp3' WHERE elevenlabs_voice_id = 'LZVDFbYLTcl0GkxDmyWe' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/b3O6h8joTZbVWUykQKQA/14f7ad01-b79d-477d-bafc-ce067170eba4.mp3' WHERE elevenlabs_voice_id = 'b3O6h8joTZbVWUykQKQA' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/kFg2t4rNmGtIKkJI8Rml/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiOGU2NmU0NjYtNGRhOS00MjE3LWJkZWEtOGJmYmUyYmQ2ZjdmLm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'kFg2t4rNmGtIKkJI8Rml' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/wplbCYzd35t6D6y00c9j/13dbf020-21f7-410e-85a7-79392b220565.mp3' WHERE elevenlabs_voice_id = 'wplbCYzd35t6D6y00c9j' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/OM9xwkU4ZM8dlvWOev3J/2ace8a38-89d2-4715-bfd9-c7b54f97b752.mp3' WHERE elevenlabs_voice_id = 'OM9xwkU4ZM8dlvWOev3J' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/SZerLwGb1NeK3eR4hrh6/5eaf15e6-892c-4973-8165-658686791a56.mp3' WHERE elevenlabs_voice_id = 'SZerLwGb1NeK3eR4hrh6' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/AXOPpokL7lng4OPc1L0P/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiOGQ0MTdkNWItMDMxYi00Y2YxLWIzOWEtNmY3MzExZmUxNjRhLm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'AXOPpokL7lng4OPc1L0P' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/ecF3arP2KBwcy3FM5xRC/8f6a736e-f655-4358-8667-371093c78363.mp3' WHERE elevenlabs_voice_id = 'ecF3arP2KBwcy3FM5xRC' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/xRMpxegKwxAenIn6K3Hn/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiYmQ3OGZjMDktMDU3MC00ZDc1LWEwNTItMTUzNGI0ODY4Nzk0Lm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'xRMpxegKwxAenIn6K3Hn' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/gOZRcEzY40chlRuMDmLV/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiI2ZDE3MDc2N2QyYzM0ZGNlYjM2YTdhYzMzMzIwODk1YiIsImZpbGVuYW1lIjoiYzYzZGEzYjktYzFkNS00MDhmLTk0ZjYtMGRlZGM3NGU5ZjAxLm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'gOZRcEzY40chlRuMDmLV' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/c7aa3d4b9c674102b1cc0eb59c0b3d21/voices/1nFfPv6rPB37Tt2950M0/EAVBYCAxbdp46KoPsZII.mp3' WHERE elevenlabs_voice_id = '1nFfPv6rPB37Tt2950M0' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/10ab341b15a24f9aa118a90e43463bab/voices/loY1uopAz31XyhAEhNSa/ZPipDXt0PC09nhVJRVPU.mp3' WHERE elevenlabs_voice_id = 'loY1uopAz31XyhAEhNSa' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/0rEo3eAjssGDUCXHYENf/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ1c2VyX2lkIjoiZ1F6RjlFcjNhWFU5VDB4UVlHUjgxQnJSMVd2MiIsImZpbGVuYW1lIjoiT2FubWp2a0x6QndTdHI1VE8yWGIubXAzIiwidGltZXN0YW1wIjoxNzkzODE1MjAwMDAwMDAwfQ%3D%3D' WHERE elevenlabs_voice_id = '0rEo3eAjssGDUCXHYENf' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pqHfZKP75CvOlQylNhV4/d782b3ff-84ba-4029-848c-acf01285524d.mp3' WHERE elevenlabs_voice_id = 'pqHfZKP75CvOlQylNhV4' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/user/LBTVCyr9IOfZWE8bmkz0u7zR5pr2/voices/mHlts5QHKpF8NPCOjcgW/18c48eda-352c-49fb-9ee8-94cb640dbcf1.mp3' WHERE elevenlabs_voice_id = 'mHlts5QHKpF8NPCOjcgW' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/d0a2a01c34834bbd86064d9e3b0494d5/voices/O11m50SZJXmCRtJubOuL/E6x6DCRnDpAkQbilHnmH.mp3' WHERE elevenlabs_voice_id = 'O11m50SZJXmCRtJubOuL' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/user/cPfopEAPbIUAwzg7EgJyxjecKlW2/voices/Pb8RZcHs3ga4StE7wiPM/dZKVaLpYTBYBYx4zY7Ym.mp3' WHERE elevenlabs_voice_id = 'Pb8RZcHs3ga4StE7wiPM' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9642e6cf022e4ae5807e824591c0cdb3/voices/fvmkmNaIvqNTpXkcg7GK/9eb02eef-2560-4297-8549-6b1c7003a6a5.mp3' WHERE elevenlabs_voice_id = 'fvmkmNaIvqNTpXkcg7GK' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/jSuBIjxMKhqIfb0wCK1F/b303c261-17fd-43e3-bd67-96365b33c6fb.mp3' WHERE elevenlabs_voice_id = 'jSuBIjxMKhqIfb0wCK1F' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/ovUpRQCoNYADjai0c9kP/1801feaf-2e68-4a69-a7be-cc1779769f6e.mp3' WHERE elevenlabs_voice_id = 'ovUpRQCoNYADjai0c9kP' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/lrNW0BJYfUIVVt3VDdUy/555d10cb-9ab7-453c-be37-c4ede79db502.mp3' WHERE elevenlabs_voice_id = 'lrNW0BJYfUIVVt3VDdUy' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/azh4nsbTITfkYjggyoxF/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmM2Q1MDdiMDQyMjQ0MjU2YTVjY2UyNmJkY2U2M2Y4MCIsImZpbGVuYW1lIjoiMzJlMTBkNmYtZmFmOC00NTZhLWE3MDgtYTRkMzAzMWM2NGU5Lm1wMyIsInRpbWVzdGFtcCI6MTc5MzgxNTIwMDAwMDAwMH0%3D' WHERE elevenlabs_voice_id = 'azh4nsbTITfkYjggyoxF' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/gOupLcAkjEnguROwi4oS/AyYfK0CnNPq37Rzj9jA3.mp3' WHERE elevenlabs_voice_id = 'gOupLcAkjEnguROwi4oS' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f3d507b042244256a5cce26bdce63f80/voices/3dBvD0E5FtlvoRbqhcbM/8f41af6b-b4b0-4e95-a856-84b974862690.mp3' WHERE elevenlabs_voice_id = '3dBvD0E5FtlvoRbqhcbM' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://api.us.elevenlabs.io/v1/voices/RckSZHfvva0yOVRPzRfv/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiI2N2U5MTEzOTA0MTU0NDdiODc3YjExZTRiNjcwMDBlMyIsImZpbGVuYW1lIjoiV0xkeW56NjBpbTRkV2l2cWJPdloubXAzIiwidGltZXN0YW1wIjoxNzkzODE1MjAwMDAwMDAwfQ%3D%3D' WHERE elevenlabs_voice_id = 'RckSZHfvva0yOVRPzRfv' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/5ac0068f54e2485ea07303453a40729c/voices/esy0r39YPLQjOczyOib8/HTHkPiNlxYETEllpEhuJ.mp3' WHERE elevenlabs_voice_id = 'esy0r39YPLQjOczyOib8' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/database/workspace/5ff95209ad98433f8fabdc125ecb849b/voices/Qin2NRfiKVQMJLxnoZaY/s59CVI1N0TETYyKi9SoM.mp3' WHERE elevenlabs_voice_id = 'Qin2NRfiKVQMJLxnoZaY' AND sample_url IS NULL;
UPDATE narrator_voices SET sample_url = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3' WHERE elevenlabs_voice_id = 'bIHbv24MWmeRgasZH58o' AND sample_url IS NULL;
-- (sample_url filled: 70)

-- ── 3. source classification (108 rows) ──
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'XrExE9yKIg1WjnnlVkGX';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'IRHApOXLvnW57QJPQH2P';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'jQKNVOWM9XL57z7bMalU';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'hpp4J3VqNfWAUOO0d1Us';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'SOYHLrjzK2X1ezoPC6cr';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'N2lVS1w4EtoT3dr4eOWO';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'IKuPqyuiEnnZFcU4OVzH';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'cgSgspJ2msm6clMCkdW9';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'CwhRBWXzGAHq8TQ4Fs17';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'FGY2WhTYpPnrIDTdsKH5';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'cjVigY5qzO86Huf0OWal';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'SAz9YHcvj6GT2YYXdXww';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'nPczCjzI2devNBz1zQrb';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'ZmqEPiBIr4itJeB29TyD';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'aQ3vv2wCbTCVUwH4ESOO';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'yI0BY0SdffEkqmjTOUFc';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'lWDDHwXsJXJM7nv2YgHY';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'hA4zGnmTwX2NQiTRMt7o';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'qSR2T7SqN7Pcd0YpO3Vd';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'NtS6nEHDYMQC9QczMQuq';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'v9LgF91V36LGgbLX3iHW';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'E819nNJEjUWvUHA3lfDl';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'TbEd6wZh117FdOyTGS3q';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'oRs8PdnFAUhXes30NKDT';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '64ZIZpnfEIjUuIyw3uKc';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '9hGxRHDrJPVBk2ipyuuk';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'qvosafgNfYIPsgDOIotN';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'Bx6E7XGop7E6X9OCwIyh';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'qD9ofb9chWh4dfRCWMPx';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'DgL4aqeif7j5vXmFZCtm';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'uYhHpSFNoyh13x7mzmxh';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'fXyxAavMrsCdaI4F1nfo';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'IUhCu3b4pGewXKWMYl4x';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'zAQ1LDstS09AHR0ofagw';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'fZAt42eVuCC3sGVb7L7E';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'WAyRKxPYHcG6u7yB1woY';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '7vcAfiAL1LP6cgdQF51s';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'b4xC7oVqnoQHjp1TmJAF';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '28N9BmQmmLh1arPTAAqW';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '7eosGqyFqolpQapMkYEz';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'k64C4NILG34yJeeFwKgK';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'GUtvmpvjSsoZlvjTKGXi';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'an8Hknyh1gi20hTRQ3XU';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'kAYYFAgDr7733PWV6mKe';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'LZVDFbYLTcl0GkxDmyWe';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'b3O6h8joTZbVWUykQKQA';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'kFg2t4rNmGtIKkJI8Rml';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'wplbCYzd35t6D6y00c9j';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'OM9xwkU4ZM8dlvWOev3J';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'SZerLwGb1NeK3eR4hrh6';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'AXOPpokL7lng4OPc1L0P';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'ecF3arP2KBwcy3FM5xRC';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'xRMpxegKwxAenIn6K3Hn';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'gOZRcEzY40chlRuMDmLV';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '1nFfPv6rPB37Tt2950M0';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'loY1uopAz31XyhAEhNSa';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '0rEo3eAjssGDUCXHYENf';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'pqHfZKP75CvOlQylNhV4';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'mHlts5QHKpF8NPCOjcgW';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'O11m50SZJXmCRtJubOuL';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'Pb8RZcHs3ga4StE7wiPM';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'fvmkmNaIvqNTpXkcg7GK';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'jSuBIjxMKhqIfb0wCK1F';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'ovUpRQCoNYADjai0c9kP';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'lrNW0BJYfUIVVt3VDdUy';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'azh4nsbTITfkYjggyoxF';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'gOupLcAkjEnguROwi4oS';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '3dBvD0E5FtlvoRbqhcbM';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'RckSZHfvva0yOVRPzRfv';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'esy0r39YPLQjOczyOib8';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'Qin2NRfiKVQMJLxnoZaY';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'bIHbv24MWmeRgasZH58o';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = '1rnYMVDXZksVr6x7pZPX';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'cauGUrZQIRUvQs3glrUi';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'FNhoq0qHG3T8YOWzBtd6';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'L39mCFEANiRSjBYTGelY';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'TfVjIROhkRShQb9pCFfK';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'wxlw6ulIrrWVbeIh6Jut';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'iVwieylcLv7bwfinSNdw';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'Bk8cLrXXi9WCZ4GQU4Ah';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = '6j8uSqQkZH2WrWDVIiRB';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'NL5yDL1ccYeWsAKmxP3r';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'QzgYVYSNBgksoEWDkpKt';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = '7kTHQRfmpeNlB1V4xfvV';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'Xu3wSNsJpZX7XVk3w9yS';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'YXpFCvM1S3JbWEJhoskW';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = '0lp4RIz96WD1RUtvEu3Q';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'y2Y5MeVPm6ZQXK64WUui';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'MKlLqCItoCkvdhrxgtLv';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = '0hh7H4ZVAtaGpm1VZyEN';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'PerZoH0r6nxBZXCoIPpv';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'bRlp5mUWs01wX4H4oW4X';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'htZQqY7WtacRNV7s62Iy';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'wGcFBfKz5yUQqhqr0mVy';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'A0g6t0RQc9zkMPsGNEIG';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = '1hlpeD1ydbI2ow0Tt3EW';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'iBo5PWT1qLiEyqhM7TrG';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'Z5JpFCNFIz8Nhe4KEikq';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'M8391pS6bItq6N4ptCRa';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'GsjQ0ydx7QzhDLqInGtT';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'G5ZnbSWZOwppzVTp0uTm';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'lMILJ9d29MrRXy9BIgcz';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'jD4PjnscE4XmlzgsuqY0';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'mfxPGiKweaQEsXJix2Ve';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'QRcumt9oV9EP5UgzLrFK';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = '7FroLDTDG92jPfUW6BlQ';
UPDATE narrator_voices SET source = 'library' WHERE elevenlabs_voice_id = 'lo1O1Dz1Tu4FWVEPaxuT';
UPDATE narrator_voices SET source = 'custom' WHERE elevenlabs_voice_id = 'L7tnZ2Iaul3XxXEBVYoz';

-- ── 4. status / reserved_for — current approved leads ONLY ──
UPDATE narrator_voices SET status = 'available', reserved_for = NULL WHERE id IS NOT NULL; -- reset
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Sunset: Athena; Altar: Athena' WHERE elevenlabs_voice_id = 'Qin2NRfiKVQMJLxnoZaY';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Altar: ET Barbara' WHERE elevenlabs_voice_id = '3dBvD0E5FtlvoRbqhcbM';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Altar: Arlo' WHERE elevenlabs_voice_id = 'RckSZHfvva0yOVRPzRfv';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Altar: Brittney' WHERE elevenlabs_voice_id = 'esy0r39YPLQjOczyOib8';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Altar: Ray Dolan' WHERE elevenlabs_voice_id = 'CwhRBWXzGAHq8TQ4Fs17';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Lake House: ALMA' WHERE elevenlabs_voice_id = '0rEo3eAjssGDUCXHYENf';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Lake House: HOLDEN' WHERE elevenlabs_voice_id = 'kAYYFAgDr7733PWV6mKe';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Lake House: SIDNEY' WHERE elevenlabs_voice_id = 'Pb8RZcHs3ga4StE7wiPM';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Lake House: ROBERT' WHERE elevenlabs_voice_id = 'IRHApOXLvnW57QJPQH2P';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Lake House: EARL' WHERE elevenlabs_voice_id = 'an8Hknyh1gi20hTRQ3XU';
UPDATE narrator_voices SET status = 'reserved', reserved_for = 'Lake House: MAEVE' WHERE elevenlabs_voice_id = 'WAyRKxPYHcG6u7yB1woY';
UPDATE narrator_voices SET status = 'retired' WHERE elevenlabs_voice_id = 'aQ3vv2wCbTCVUwH4ESOO'; -- Eve (retired 2026-07-19)

-- ── 5. Gemini-listened columns (gemini_clarity, gemini_accent, best_use, avoid_for,
--    pace_energy, accent_strength) — LEFT NULL. Listening pass NOT yet performed
--    (no audio-eval tool in this environment). Priority worklist + runner stub:
--    scripts/voice-grid-gemini-score.js. Score reserved leads + customs pool first.

-- ── 6. MISSING VOICES — approved leads with NO narrator_voices row yet. ──
--    Add these rows (INSERT) only after the voices exist in the ElevenLabs account
--    and Don confirms. Proposed codes reserved (no collision with live or §1 codes).
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status, reserved_for) VALUES
--   ('Bianca — Sunset: Bianca', 'cc8f8a64', '...', true, 'NR-FE-AD-CO-US-V3', 'custom', 'reserved', 'Sunset: Bianca'); -- Bianca — Sunset: Bianca  [PENDING — voice not in DB]
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status, reserved_for) VALUES
--   ('Wayne — Sunset: Wayne', '8d833599', '...', true, 'NR-MA-AD-CO-US-V1', 'custom', 'reserved', 'Sunset: Wayne'); -- Wayne — Sunset: Wayne  [PENDING — voice not in DB]
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status, reserved_for) VALUES
--   ('Kieran — Sunset: Kieran', '2o6p5h795eBNmOyonrvk', '...', true, 'NR-MA-AD-ME-US-V2', 'custom', 'reserved', 'Sunset: Kieran'); -- Kieran — Sunset: Kieran  [PENDING — voice not in DB]
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status, reserved_for) VALUES
--   ('NELL — Lake House: NELL', 'H8O93f2AEAWHHHXPVQBV', '...', true, 'NR-FE-M4-CO-US-V1', 'custom', 'reserved', 'Lake House: NELL'); -- NELL — Lake House: NELL  [PENDING — voice not in DB]
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status, reserved_for) VALUES
--   ('LORETTA — Lake House: LORETTA', 'p60J1MCLS65rBrlMzZjY', '...', true, 'NR-FE-L5-WM-US-V2', 'custom', 'reserved', 'Lake House: LORETTA'); -- LORETTA — Lake House: LORETTA  [PENDING — voice not in DB]
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status, reserved_for) VALUES
--   ('NARRATOR — Lake House: NARRATOR', 'dTd5GhFbGAPx2RxEH2D', '...', true, 'NR-MA-AD-NT-US-V3', 'custom', 'reserved', 'Lake House: NARRATOR'); -- NARRATOR — Lake House: NARRATOR  [PENDING — voice not in DB]
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status) VALUES
--   ('Belle B — hook10-boss announcer (in EL account, no DB row)', 'GMhgX8fCR9GUtd3kmlKC', '...', true, 'NR-FE-AD-WM-US-V10', 'custom', 'reserved', 'available'); -- Belle B — hook10-boss announcer (in EL account, no DB row)  [PENDING — voice not in DB]
-- INSERT INTO narrator_voices (name, elevenlabs_voice_id, gender, is_active, voice_code, source, status) VALUES
--   ('Sarah (premade) — hook-text Anita (NOT in EL account, premade only)', 'EXAVITQu4vr4xnSDxMaL', '...', true, 'NR-FE-AD-WM-US-V11', 'custom', 'reserved', 'available'); -- Sarah (premade) — hook-text Anita (NOT in EL account, premade only)  [PENDING — voice not in DB]
