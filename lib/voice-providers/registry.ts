/**
 * Voice Code Registry
 *
 * Supabase-backed cache that maps voice_code → provider voice_id.
 * Acts as a fast, credit-free lookup layer in front of ElevenLabs.
 *
 * createOrFetchVoice flow:
 *   1. Check registry (free, <10ms DB lookup)
 *   2. If found → return immediately, skip all EL API calls
 *   3. If not found → EL list → EL design → EL create → write registry
 *
 * This eliminates redundant /v2/voices pagination on every production job.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { VoiceMeta } from './types'
import { VOICE_CODE_SCHEMA_VERSION } from './voice-code'

// ---------------------------------------------------------------------------
// Registry row shape (matches the SQL migration)
// ---------------------------------------------------------------------------

export interface VoiceRegistryRow {
  id: string
  voice_code: string
  voice_code_schema_version: number
  provider: string
  provider_voice_id: string
  voice_name: string
  voice_description: string | null
  voice_category: string | null
  labels: Record<string, string> | null
  is_active: boolean
  created_at: string
  updated_at: string
  last_verified_at: string | null
}

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

export class VoiceCodeRegistry {
  private readonly supabase: SupabaseClient
  private readonly table = 'voice_code_registry'

  constructor(supabase?: SupabaseClient) {
    this.supabase =
      supabase ??
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
  }

  // -------------------------------------------------------------------------
  // lookup — check registry before hitting EL API
  // -------------------------------------------------------------------------

  async lookup(voice_code: string, provider = 'elevenlabs'): Promise<VoiceMeta | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('provider_voice_id, voice_name, voice_category, labels, voice_description')
      .eq('voice_code', voice_code)
      .eq('provider', provider)
      .eq('is_active', true)
      .single()

    if (error || !data) return null

    return {
      voice_id: data.provider_voice_id,
      name: data.voice_name,
      category: data.voice_category ?? undefined,
      labels: data.labels ?? undefined,
      description: data.voice_description ?? undefined,
    }
  }

  // -------------------------------------------------------------------------
  // upsert — write after successful voice creation
  // -------------------------------------------------------------------------

  async upsert(params: {
    voice_code: string
    provider: string
    voice: VoiceMeta
  }): Promise<void> {
    const now = new Date().toISOString()
    const row: Partial<VoiceRegistryRow> = {
      voice_code: params.voice_code,
      voice_code_schema_version: VOICE_CODE_SCHEMA_VERSION,
      provider: params.provider,
      provider_voice_id: params.voice.voice_id,
      voice_name: params.voice.name,
      voice_description: params.voice.description ?? null,
      voice_category: params.voice.category ?? null,
      labels: params.voice.labels ?? null,
      is_active: true,
      updated_at: now,
      last_verified_at: now,
    }

    const { error } = await this.supabase
      .from(this.table)
      .upsert(row, { onConflict: 'voice_code,provider' })

    if (error) {
      // Non-fatal: log but don't throw — the voice was already created
      console.error('[VoiceRegistry] upsert failed (non-fatal):', error.message)
    }
  }

  // -------------------------------------------------------------------------
  // deactivate — soft-delete when a voice is removed from EL
  // -------------------------------------------------------------------------

  async deactivate(voice_code: string, provider = 'elevenlabs'): Promise<void> {
    await this.supabase
      .from(this.table)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('voice_code', voice_code)
      .eq('provider', provider)
  }

  // -------------------------------------------------------------------------
  // verifyAndTouch — confirm voice still exists in EL, update last_verified_at
  // -------------------------------------------------------------------------

  async verifyAndTouch(voice_code: string, provider = 'elevenlabs'): Promise<void> {
    await this.supabase
      .from(this.table)
      .update({ last_verified_at: new Date().toISOString() })
      .eq('voice_code', voice_code)
      .eq('provider', provider)
  }

  // -------------------------------------------------------------------------
  // listActive — admin view
  // -------------------------------------------------------------------------

  async listActive(provider?: string): Promise<VoiceRegistryRow[]> {
    let query = this.supabase
      .from(this.table)
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (provider) {
      query = query.eq('provider', provider)
    }

    const { data, error } = await query
    if (error) {
      console.error('[VoiceRegistry] listActive failed:', error.message)
      return []
    }
    return (data as VoiceRegistryRow[]) ?? []
  }
}

// Singleton — reuse across calls in the same process
let _registryInstance: VoiceCodeRegistry | null = null

export function getRegistry(supabase?: SupabaseClient): VoiceCodeRegistry {
  if (supabase) return new VoiceCodeRegistry(supabase)
  if (!_registryInstance) _registryInstance = new VoiceCodeRegistry()
  return _registryInstance
}
