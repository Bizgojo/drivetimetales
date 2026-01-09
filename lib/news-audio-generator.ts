// lib/news-audio-generator.ts
// Generates audio from news script using ElevenLabs API

import { NewsScript, scriptToPlainText } from './news-script-generator';

interface AudioGenerationResult {
  audioBuffer: Buffer;
  durationSeconds: number;
  charactersUsed: number;
  voiceId: string;
}

// Available anchor voices (you can add more or let user pick)
export const ANCHOR_VOICES = {
  'Rachel': '21m00Tcm4TlvDq8ikWAM',      // Professional female
  'Drew': '29vD33N1CtxCmqQRPOHJ',         // Professional male
  'Clyde': '2EiwWnXFnvU5JabPnv8n',        // Deep male
  'Domi': 'AZnzlk1XvdvUeBnXmlld',         // Young female
  'Dave': 'CYw3kZ02Hs0563khs1Fj',         // Middle-aged male
  'Fin': 'D38z5RcWu1voky8WS1ja',          // Irish male
  'Sarah': 'EXAVITQu4vr4xnSDxMaL',        // Soft female
  'Antoni': 'ErXwobaYiN019PkySvjV',       // Young male
  'Thomas': 'GBv7mTt0atIp3Br8iCZE',       // Calm male
  'Charlie': 'IKne3meq5aSn9XLyUdCD',      // Australian male
  'George': 'JBFqnCBsd6RMkjVDRZzb',       // British male
  'Emily': 'LcfcDJNUP1GQjkzn1xUU',        // American female
  'Elli': 'MF3mGyEYCl7XYWbV9V6O',         // Young female
  'Callum': 'N2lVS1w4EtoT3dr4eOWO',       // Male transatlantic
  'Patrick': 'ODq5zmih8GrVes37Dizd',      // Male young American
  'Harry': 'SOYHLrjzK2X1ezoPC6cr',        // Male American
  'Liam': 'TX3LPaxmHKxFdv7VOQHJ',         // Male American
  'Dorothy': 'ThT5KcBeYPX3keUQqHPh',      // British female
  'Josh': 'TxGEqnHWrfWFTfGW9XjX',         // Young male American
  'Arnold': 'VR6AewLTigWG4xSOukaG',       // Male gravelly
  'Charlotte': 'XB0fDUnXU5powFXDhCwa',    // Swedish female
  'Matilda': 'XrExE9yKIg1WjnnlVkGX',      // Warm female
  'Matthew': 'Yko7PKs6JE2pOW2cCdBZ',      // British male
  'James': 'ZQe5CZNOzWyzPSCn5a3c',        // Australian male
  'Joseph': 'Zlb1dXrM653N07WRdFW3',       // British male
  'Michael': 'flq6f7yk4E4fJM5XTYuZ',      // Male American
  'Ethan': 'g5CIjZEefAph4nQFvHAz',        // Young male
  'Gigi': 'jBpfuIE2acCO8z3wKNLl',         // American female
  'Freya': 'jsCqWAovK2LkecY7zXl4',        // American female
  'Grace': 'oWAxZDx7w5VEj9dCyTzz',        // American female
  'Daniel': 'onwK4e9ZLuTAKqWW03F9',       // Deep male
  'Lily': 'pFZP5JQG7iQjIQuC4Bku',         // British female
  'Serena': 'pMsXgVXv3BLzUgSXRplE',       // Pleasant female
  'Adam': 'pNInz6obpgDQGcFmaJgB',         // Deep male
  'Nicole': 's3LrbQkyRe2A49ZRP2jf',       // Whisper female
  'Glinda': 'z9fAnlkpzviPz146aGWa',       // Witch female
  'Giovanni': 'zcAOhNBS3c14rBihAFp1',     // Italian male
  'Mimi': 'zrHiDhphv9ZnVXBqCLjz',         // Swedish female
};

// Default voice for DTT Anchor
const DEFAULT_ANCHOR_VOICE = 'Rachel'; // Professional female voice

export async function generateNewsAudio(
  script: NewsScript,
  elevenLabsApiKey: string,
  voiceId?: string
): Promise<AudioGenerationResult> {
  const selectedVoiceId = voiceId || ANCHOR_VOICES[DEFAULT_ANCHOR_VOICE];
  
  // Convert script to plain text
  const scriptText = scriptToPlainText(script);
  const charactersUsed = scriptText.length;
  
  // Generate audio using ElevenLabs API
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
    {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey
      },
      body: JSON.stringify({
        text: scriptText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3, // Some style for natural delivery
          use_speaker_boost: true
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  
  // Estimate duration (rough: 150 words per minute, average word = 5 chars)
  const estimatedWords = charactersUsed / 5;
  const durationSeconds = Math.ceil((estimatedWords / 150) * 60);

  return {
    audioBuffer,
    durationSeconds,
    charactersUsed,
    voiceId: selectedVoiceId
  };
}

// Generate audio in chunks for very long scripts (ElevenLabs has limits)
export async function generateNewsAudioChunked(
  script: NewsScript,
  elevenLabsApiKey: string,
  voiceId?: string,
  onProgress?: (section: string, progress: number) => void
): Promise<AudioGenerationResult> {
  const selectedVoiceId = voiceId || ANCHOR_VOICES[DEFAULT_ANCHOR_VOICE];
  const audioChunks: Buffer[] = [];
  let totalCharacters = 0;

  // Generate each section separately
  for (let i = 0; i < script.sections.length; i++) {
    const section = script.sections[i];
    const sectionText = section.lines.map(l => l.text).join('\n\n');
    totalCharacters += sectionText.length;

    if (onProgress) {
      onProgress(section.title, (i / script.sections.length) * 100);
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey
        },
        body: JSON.stringify({
          text: sectionText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error on section ${section.title}: ${response.status}`);
    }

    audioChunks.push(Buffer.from(await response.arrayBuffer()));

    // Small delay between sections to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Concatenate all audio chunks
  const audioBuffer = Buffer.concat(audioChunks);
  const estimatedWords = totalCharacters / 5;
  const durationSeconds = Math.ceil((estimatedWords / 150) * 60);

  return {
    audioBuffer,
    durationSeconds,
    charactersUsed: totalCharacters,
    voiceId: selectedVoiceId
  };
}

// Check ElevenLabs credit balance
export async function checkElevenLabsCredits(apiKey: string): Promise<{
  character_count: number;
  character_limit: number;
  remaining: number;
}> {
  const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: {
      'xi-api-key': apiKey
    }
  });

  if (!response.ok) {
    throw new Error('Failed to check ElevenLabs credits');
  }

  const data = await response.json();
  return {
    character_count: data.character_count || 0,
    character_limit: data.character_limit || 0,
    remaining: (data.character_limit || 0) - (data.character_count || 0)
  };
}

// Get voice name from ID
export function getVoiceNameById(voiceId: string): string | null {
  for (const [name, id] of Object.entries(ANCHOR_VOICES)) {
    if (id === voiceId) return name;
  }
  return null;
}
