#!/bin/bash
echo "🔄 Killing dev server..."
pkill -f "next dev" 2>/dev/null
sleep 1
echo "🗑️  Clearing .next cache..."
rm -rf /Users/williampostlewaite/Projects/drivetimetales/.next
echo "🚀 Starting dev server on port 3001..."
cd /Users/williampostlewaite/Projects/drivetimetales && npm run dev -- --port 3001
