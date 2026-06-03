export type ExternalToolLink = {
  id: string
  label: string
  url: string
}

export const COMMAND_CENTER_EXTERNAL_LINKS: ExternalToolLink[] = [
  { id: 'telegram', label: 'Telegram', url: 'https://web.telegram.org' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai' },
  { id: 'supabase', label: 'Supabase', url: 'https://supabase.com/dashboard' },
  { id: 'vercel', label: 'Vercel', url: 'https://vercel.com/dashboard' },
  { id: 'github', label: 'GitHub', url: 'https://github.com' },
]

export type AgentId = 'hal' | 'atlas' | 'codex' | 'susan' | 'orion'
export type AgentStatus = 'working' | 'waiting' | 'blocked' | 'complete' | 'idle'
export type MissionStatus = 'active' | 'waiting' | 'blocked' | 'complete' | 'archived'
export type MissionPriority = 'P1' | 'P2' | 'P3' | 'P4'

export interface AgentConfig {
  id: AgentId
  displayName: string
  emoji: string
  accentColor: string
}

export const AGENTS: AgentConfig[] = [
  { id: 'hal', displayName: 'Hal', emoji: '🎙', accentColor: '#f97316' },
  { id: 'atlas', displayName: 'Atlas', emoji: '🗺', accentColor: '#0ea5e9' },
  { id: 'codex', displayName: 'Codex', emoji: '💻', accentColor: '#22c55e' },
  { id: 'susan', displayName: 'Susan', emoji: '📊', accentColor: '#a855f7' },
  { id: 'orion', displayName: 'Orion', emoji: '🔭', accentColor: '#ef4444' },
]

export interface AgentState {
  status: AgentStatus
  currentTask: string
  percentComplete: number | null
  waitingOn: string
  lastActivity: string
  eta: string
}

export interface Mission {
  id: string
  title: string
  agentId: AgentId | 'unassigned'
  status: MissionStatus
  priority: MissionPriority
  percentComplete: number | null
  waitingOn: string
  lastActivity: string
  eta: string
  notes: string
  unread: boolean
  createdAt: string
  updatedAt: string
}

export const MISSION_PRIORITY_COLORS: Record<MissionPriority, string> = {
  P1: '#ef4444',
  P2: '#f97316',
  P3: '#64748b',
  P4: '#94a3b8',
}
