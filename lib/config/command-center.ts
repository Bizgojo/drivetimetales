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

export type AgentId = 'hal' | 'atlas' | 'codex' | 'susan' | 'orion' | 'maya' | 'vega'
export type AgentStatus = 'working' | 'waiting' | 'blocked' | 'complete' | 'idle'
export type MissionStatus = 'active' | 'waiting' | 'blocked' | 'complete' | 'archived'
export type MissionPriority = 'P1' | 'P2' | 'P3' | 'P4'

export interface AgentConfig {
  id: AgentId
  displayName: string
  emoji: string
  accentColor: string
  roleTitle: string
  responsibilities: string[]
}

export const AGENTS: AgentConfig[] = [
  {
    id: 'hal',
    displayName: 'Hal',
    emoji: '🎙',
    accentColor: '#f97316',
    roleTitle: 'Content Director',
    responsibilities: [
      'Story scripts and quality control',
      'ASC3 pipeline management',
      'ElevenLabs credit management',
      'Post-launch production queue',
      'Series continuity and sequencing',
    ],
  },
  {
    id: 'atlas',
    displayName: 'Atlas',
    emoji: '🗺',
    accentColor: '#0ea5e9',
    roleTitle: 'Operations Manager',
    responsibilities: [
      'Platform reliability and deployments',
      'Domain and infrastructure',
      'Stripe payments and checkout',
      'Security and admin access',
      'Cron health and monitoring',
    ],
  },
  {
    id: 'codex',
    displayName: 'Codex',
    emoji: '💻',
    accentColor: '#22c55e',
    roleTitle: 'Technical Executor',
    responsibilities: [
      'Code implementation (Atlas-directed)',
      'Feature builds',
      'Bug fixes',
      'Refactors',
    ],
  },
  {
    id: 'susan',
    displayName: 'Susan',
    emoji: '📊',
    accentColor: '#a855f7',
    roleTitle: 'Marketing Manager',
    responsibilities: [
      'Subscriber acquisition strategy',
      'GTM plan and social channels',
      'Waitlist management',
      'Landing page brief',
      'Founding Member strategy',
    ],
  },
  {
    id: 'orion',
    displayName: 'Orion',
    emoji: '🔭',
    accentColor: '#ef4444',
    roleTitle: 'Chief Operating Officer',
    responsibilities: [
      'Organizational coordination',
      'Mission assignment and tracking',
      'Bottleneck resolution',
      'Launch readiness oversight',
      'Daily and weekly reporting to Marc',
    ],
  },
  {
    id: 'maya',
    displayName: 'Maya',
    emoji: '📐',
    accentColor: '#8b5cf6',
    roleTitle: 'Product Manager',
    responsibilities: [
      'Subscriber experience evaluation',
      'Retention risk analysis',
      'Discovery and navigation audit',
      'Onboarding assessment',
      'Mobile experience QA',
    ],
  },
  {
    id: 'vega',
    displayName: 'Vega',
    emoji: '🎧',
    accentColor: '#10b981',
    roleTitle: 'Audio Quality Manager',
    responsibilities: [
      'Audio quality standard (ASC3)',
      'Full catalog QC audit',
      'QC gate for all stories before Marc review',
      'Listening time verification',
      'Belle B voice consistency',
    ],
  },
]

export interface AgentState {
  status: AgentStatus
  currentTask: string
  percentComplete: number | null
  waitingOn: string
  lastActivity: string
  eta: string
  whyItMatters: string
  lastReport: { text: string; timestamp: string } | null
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

export interface OrionReport {
  id: string
  type: 'morning' | 'evening' | 'weekly'
  content: string
  timestamp: string
}

export interface MarcBlocker {
  id: string
  description: string
  department: AgentId
  createdAt: string
  done: boolean
  resolvedAt: string | null
}

export interface LaunchReadiness {
  score: number
  gatesGreen: number
  gatesYellow: number
  gatesRed: number
  bestCaseDate: string
  mostLikelyDate: string
  updatedAt: string
}

export const ORION_CHAT_URL = 'https://app.openclaw.ai/chat/orion'
