// lib/news-script-generator.ts
// Generates the news script using Claude API

import Anthropic from '@anthropic-ai/sdk';
import { NewsStory } from './news-fetcher';

interface ScriptSection {
  type: 'intro' | 'news' | 'science' | 'sports' | 'outro';
  title: string;
  lines: ScriptLine[];
}

interface ScriptLine {
  character: 'ANCHOR';
  text: string;
  pause_after?: number; // milliseconds
}

export interface NewsScript {
  title: string;
  edition: 'morning' | 'evening';
  date: string;
  sections: ScriptSection[];
  estimatedDuration: number; // minutes
  generatedAt: string;
  sourcesUsed: {
    news: string[];
    science: string[];
    sports: string[];
  };
}

// Generate the full news script
export async function generateNewsScript(
  stories: {
    news: NewsStory[];
    science: NewsStory[];
    sports: NewsStory[];
  },
  edition: 'morning' | 'evening',
  anthropicApiKey: string
): Promise<NewsScript> {
  const client = new Anthropic({ apiKey: anthropicApiKey });
  
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const editionLabel = edition === 'morning' ? 'Morning' : 'Evening';
  const greeting = edition === 'morning' 
    ? "Good morning, and welcome to your Drive Time Tales Daily Briefing"
    : "Good evening, and welcome to your Drive Time Tales Daily Briefing";

  // Build the prompt with all stories
  const prompt = buildPrompt(stories, dateStr, editionLabel, greeting);
  
  // Call Claude API
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  // Extract the text response
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude API');
  }

  // Parse the generated script
  const scriptText = textContent.text;
  const sections = parseScriptSections(scriptText, greeting, dateStr);

  // Calculate estimated duration (rough: 150 words per minute)
  const totalWords = sections.reduce((sum, section) => {
    return sum + section.lines.reduce((lineSum, line) => {
      return lineSum + line.text.split(' ').length;
    }, 0);
  }, 0);
  const estimatedDuration = Math.ceil(totalWords / 150);

  return {
    title: `Daily Briefing - ${dateStr} ${editionLabel}`,
    edition,
    date: today.toISOString().split('T')[0],
    sections,
    estimatedDuration,
    generatedAt: new Date().toISOString(),
    sourcesUsed: {
      news: stories.news.map(s => s.source),
      science: stories.science.map(s => s.source),
      sports: stories.sports.map(s => s.source)
    }
  };
}

function buildPrompt(
  stories: { news: NewsStory[]; science: NewsStory[]; sports: NewsStory[] },
  dateStr: string,
  editionLabel: string,
  greeting: string
): string {
  return `You are a professional news anchor script writer for "Drive Time Tales Daily Briefing" - an audio news program for commuters. Write a complete script for the ${editionLabel} edition on ${dateStr}.

STYLE GUIDELINES:
- Professional but warm and conversational tone
- Clear, easy to follow while driving
- Each story should be 2-3 sentences summarizing the key points
- Include brief transitions between sections
- No speculation or opinion - just factual reporting
- Avoid complex numbers or statistics that are hard to hear

STRUCTURE:
1. INTRO: "${greeting}" + brief overview of what's coming
2. TOP NEWS: "Let's start with today's top stories..." (5 stories)
3. SCIENCE & TECH: "Now, from the world of science and technology..." (5 stories)
4. SPORTS: "And in sports..." (5 stories)
5. OUTRO: Sign-off with "That's your Daily Briefing. Safe travels, and we'll see you next time on Drive Time Tales."

===== TOP NEWS STORIES =====
${stories.news.map((s, i) => `${i + 1}. ${s.title}\n   Source: ${s.source}\n   Summary: ${s.summary}`).join('\n\n')}

===== SCIENCE & TECH STORIES =====
${stories.science.map((s, i) => `${i + 1}. ${s.title}\n   Source: ${s.source}\n   Summary: ${s.summary}`).join('\n\n')}

===== SPORTS STORIES =====
${stories.sports.map((s, i) => `${i + 1}. ${s.title}\n   Source: ${s.source}\n   Summary: ${s.summary}`).join('\n\n')}

Write the complete script now. Format each line as plain text that the anchor will read. Include natural pauses by using "..." where appropriate. The anchor character is simply called ANCHOR.

Begin the script:`;
}

function parseScriptSections(scriptText: string, greeting: string, dateStr: string): ScriptSection[] {
  const sections: ScriptSection[] = [];
  
  // Split by major sections
  const lines = scriptText.split('\n').filter(line => line.trim());
  
  let currentSection: ScriptSection = {
    type: 'intro',
    title: 'Introduction',
    lines: []
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Detect section changes
    if (trimmed.toLowerCase().includes("top stor") || 
        trimmed.toLowerCase().includes("today's headlines") ||
        trimmed.toLowerCase().includes("let's start with")) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { type: 'news', title: 'Top News', lines: [] };
    } else if (trimmed.toLowerCase().includes("science") || 
               trimmed.toLowerCase().includes("technology")) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { type: 'science', title: 'Science & Technology', lines: [] };
    } else if (trimmed.toLowerCase().includes("sports") ||
               trimmed.toLowerCase().includes("in sports")) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { type: 'sports', title: 'Sports', lines: [] };
    } else if (trimmed.toLowerCase().includes("daily briefing") && 
               trimmed.toLowerCase().includes("safe travel")) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { type: 'outro', title: 'Outro', lines: [] };
    }
    
    // Add line to current section (skip section headers)
    if (!trimmed.startsWith('===') && 
        !trimmed.startsWith('---') &&
        !trimmed.startsWith('#')) {
      currentSection.lines.push({
        character: 'ANCHOR',
        text: cleanLineText(trimmed),
        pause_after: trimmed.endsWith('...') ? 500 : 300
      });
    }
  }
  
  // Add final section
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }
  
  // Ensure we have all required sections
  if (sections.length === 0 || sections[0].type !== 'intro') {
    sections.unshift({
      type: 'intro',
      title: 'Introduction',
      lines: [{
        character: 'ANCHOR',
        text: `${greeting} for ${dateStr}. I'm your host, and I've got today's top stories from news, science, and sports. Let's get started.`,
        pause_after: 500
      }]
    });
  }
  
  return sections;
}

function cleanLineText(text: string): string {
  // Remove any character prefixes like "ANCHOR:" 
  let clean = text.replace(/^(ANCHOR|HOST|NARRATOR)\s*:\s*/i, '');
  // Remove markdown formatting
  clean = clean.replace(/\*\*/g, '').replace(/\*/g, '');
  // Clean up extra whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

// Convert script to plain text for audio generation
export function scriptToPlainText(script: NewsScript): string {
  let text = '';
  for (const section of script.sections) {
    for (const line of section.lines) {
      text += line.text + '\n\n';
    }
  }
  return text.trim();
}

// Convert script to ADM format (for compatibility with Audio Drama Maker)
export function scriptToADMFormat(script: NewsScript): string {
  let admScript = `DRIVE TIME TALES DAILY BRIEFING
${script.title}
Duration: approximately ${script.estimatedDuration} minutes

CAST:
ANCHOR - DTT News Anchor

---

`;

  for (const section of script.sections) {
    admScript += `[${section.title.toUpperCase()}]\n\n`;
    for (const line of section.lines) {
      admScript += `ANCHOR: ${line.text}\n\n`;
    }
  }
  
  return admScript;
}
