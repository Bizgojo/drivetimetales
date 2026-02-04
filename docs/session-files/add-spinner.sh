#!/bin/bash
FILE=~/Projects/drivetimetales/app/admin/news-briefings/prompts/\[category\]/page.tsx

# Create backup
cp "$FILE" "$FILE.backup"

# Create temp file with spinner added after 'use client';
head -1 "$FILE" > /tmp/newfile.tsx

cat >> /tmp/newfile.tsx << 'SPINNER'

// Spinner component
function Spinner({ color = '#ffffff' }: { color?: string }) {
  return (
    <span style={{ 
      display: 'inline-block', 
      width: '20px', 
      height: '20px', 
      border: `3px solid ${color}`, 
      borderTopColor: 'transparent', 
      borderRadius: '50%', 
      animation: 'spin 1s linear infinite', 
      marginRight: '10px', 
      verticalAlign: 'middle' 
    }} />
  );
}

const spinnerStyles = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
SPINNER

tail -n +2 "$FILE" >> /tmp/newfile.tsx

cp /tmp/newfile.tsx "$FILE"
echo "Spinner added!"
