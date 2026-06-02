export type CommandPanelId = 'hal' | 'atlas' | 'codex' | 'terminal' | 'chatgpt' | 'claude'

export type CommandPanel = {
  id: CommandPanelId
  name: string
  icon: string
  purpose: string
  currentRole: string
  accentColor: string
  externalUrl: string | null
  externalLabel: string | null
  starterPrompt: string
}

export type ExternalToolLink = {
  id: string
  label: string
  url: string
}

export const COMMAND_PANELS: CommandPanel[] = [
  {
    id: 'hal',
    name: 'Hal',
    icon: 'H',
    purpose: 'Production manager',
    currentRole: 'Coordinate story production, queue movement, repair loops, and operational status.',
    accentColor: '#f97316',
    externalUrl: null,
    externalLabel: null,
    starterPrompt: 'Hal, review the current production target and report blockers, next action, and risk.',
  },
  {
    id: 'atlas',
    name: 'Atlas',
    icon: 'A',
    purpose: 'Operations/admin/workflow manager',
    currentRole: 'Track launch readiness, account work, admin workflows, and cross-system operating notes.',
    accentColor: '#0ea5e9',
    externalUrl: null,
    externalLabel: null,
    starterPrompt: 'Atlas, summarize the operating state and identify the next admin decision Marc needs.',
  },
  {
    id: 'codex',
    name: 'Codex',
    icon: '</>',
    purpose: 'Coding implementation',
    currentRole: 'Implement scoped code changes, run checks, and report changed files and residual risk.',
    accentColor: '#22c55e',
    externalUrl: null,
    externalLabel: null,
    starterPrompt: 'Codex, inspect the relevant files first, make the smallest safe patch, run validation, and report results.',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: '$',
    purpose: 'Local command workspace',
    currentRole: 'Hold shell commands, runbook steps, deploy notes, and copy/paste operational sequences.',
    accentColor: '#64748b',
    externalUrl: null,
    externalLabel: null,
    starterPrompt: 'Prepare the exact terminal commands needed, with the working directory and validation step included.',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: 'G',
    purpose: 'Planning/writing/advisory workspace',
    currentRole: 'Support product planning, copy review, launch coordination, and structured thinking.',
    accentColor: '#10a37f',
    externalUrl: 'https://chat.openai.com',
    externalLabel: 'Open ChatGPT',
    starterPrompt: 'Help turn this operational context into a clear next-step plan with risks and decisions separated.',
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: 'C',
    purpose: 'Story/script/workflow assistant',
    currentRole: 'Support story, script, quality review, workflow reasoning, and long-form editorial planning.',
    accentColor: '#8b5cf6',
    externalUrl: 'https://claude.ai',
    externalLabel: 'Open Claude',
    starterPrompt: 'Review this story or workflow context and return a concise diagnosis plus recommended next action.',
  },
]

export const COMMAND_CENTER_EXTERNAL_LINKS: ExternalToolLink[] = [
  { id: 'telegram', label: 'Telegram', url: 'https://web.telegram.org' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai' },
  { id: 'supabase', label: 'Supabase', url: 'https://supabase.com/dashboard' },
  { id: 'vercel', label: 'Vercel', url: 'https://vercel.com/dashboard' },
  { id: 'github', label: 'GitHub', url: 'https://github.com' },
]
