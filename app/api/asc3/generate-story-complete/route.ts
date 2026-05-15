import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Deprecated route. Use Story Production V2.' },
    { status: 410 }
  )
}
