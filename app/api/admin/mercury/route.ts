import { NextResponse } from 'next/server'

const MERCURY_BASE = 'https://api.mercury.com/api/v1'

export async function GET() {
  const token = process.env.MERCURY_API_TOKEN
  if (!token) return NextResponse.json({ error: 'No Mercury token' }, { status: 500 })

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  try {
    // Get all accounts
    const accRes = await fetch(`${MERCURY_BASE}/accounts`, { headers })
    if (!accRes.ok) {
      const txt = await accRes.text()
      return NextResponse.json({ error: `Mercury API error ${accRes.status}: ${txt.slice(0,200)}` }, { status: 500 })
    }
    const accData = await accRes.json()
    const accounts = accData.accounts || []

    // Get transactions for checking account
    const checking = accounts.find((a: any) => a.kind === 'checking') || accounts[0]
    let transactions: any[] = []
    if (checking?.id) {
      const txRes = await fetch(`${MERCURY_BASE}/account/${checking.id}/transactions?limit=15&sort=createdAt:desc`, { headers })
      if (txRes.ok) {
        const txData = await txRes.json()
        transactions = txData.transactions || []
      }
    }

    return NextResponse.json({ accounts, transactions, checking })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
