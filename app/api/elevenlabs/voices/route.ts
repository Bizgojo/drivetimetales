// app/api/elevenlabs/voices/route.ts
// DTT News Briefings - ElevenLabs Voices API
// FRESH BUILD - February 2026
//
// Fetches available voices from ElevenLabs for the admin dropdown

import { NextResponse } from 'next/server';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

export async function GET() {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      console.error('[ElevenLabs] Failed to fetch voices:', response.status);
      return NextResponse.json(
        { error: 'Failed to fetch voices' },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    // Map to simpler format
    const voices = (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels
    }));

    // Sort alphabetically by name
    voices.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return NextResponse.json({ voices });
  } catch (error) {
    console.error('[ElevenLabs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voices' },
      { status: 500 }
    );
  }
}
