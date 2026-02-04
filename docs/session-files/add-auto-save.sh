#!/bin/bash
FILE=~/Projects/drivetimetales/app/admin/news-briefings/page.tsx

# Backup
cp "$FILE" "$FILE.backup2"

# 1. Add loading of global settings - find "for (const cat of CATEGORIES)" and add before it
sed -i '' 's/for (const cat of CATEGORIES) { if (!loaded\[cat.id\]) loaded\[cat.id\] = { narratorName/\/\/ Load global auto-generate settings\
      const globalRow = (data.settings || []).find((r: any) => r.category === '\''global'\'');\
      if (globalRow) {\
        if (globalRow.auto_generate !== undefined) setAutoGenerateEnabled(globalRow.auto_generate);\
        if (globalRow.schedule_times) setScheduleTimes(globalRow.schedule_times);\
      }\
      for (const cat of CATEGORIES) { if (!loaded[cat.id]) loaded[cat.id] = { narratorName/' "$FILE"

echo "Added global settings loading!"
