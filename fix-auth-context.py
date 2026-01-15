#!/usr/bin/env python3
"""
Fix AuthContext.tsx - remove 'address' column that doesn't exist in users table
"""

import os
from datetime import datetime

file_path = os.path.expanduser('~/Projects/drivetimetales/contexts/AuthContext.tsx')

# Read the current file
with open(file_path, 'r') as f:
    content = f.read()

# Create backup
backup_path = file_path + f'.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}'
with open(backup_path, 'w') as f:
    f.write(content)
print(f"Backup created: {backup_path}")

changes_made = 0

# Fix 1: Remove address from the select query
old_select = ".select('id, email, display_name, credits, subscription_type, subscription_ends_at, created_at, first_name, address, city, state, zip')"
new_select = ".select('id, email, display_name, credits, subscription_type, subscription_ends_at, created_at, first_name, state')"

if old_select in content:
    content = content.replace(old_select, new_select)
    print("✓ Removed address, city, zip from users select query")
    changes_made += 1
else:
    print("⚠ Could not find the select query to fix")
    # Try a more flexible match
    if "address, city, state, zip" in content:
        content = content.replace("address, city, state, zip", "state")
        print("✓ Removed address, city, zip (flexible match)")
        changes_made += 1

# Fix 2: Remove address from User interface if present
old_interface_line = "  address?: string | null"
if old_interface_line in content:
    content = content.replace(old_interface_line + "\n", "")
    print("✓ Removed address from User interface")
    changes_made += 1

# Also remove city and zip if present
if "  city?: string | null" in content:
    content = content.replace("  city?: string | null\n", "")
    print("✓ Removed city from User interface")
    changes_made += 1

if "  zip?: string | null" in content:
    content = content.replace("  zip?: string | null\n", "")
    print("✓ Removed zip from User interface")
    changes_made += 1

# Write the updated content
with open(file_path, 'w') as f:
    f.write(content)

print(f"\n=== SUMMARY ===")
print(f"Total changes made: {changes_made}")

# Verification
with open(file_path, 'r') as f:
    final_content = f.read()

if "address" not in final_content:
    print("✓ VERIFIED: No 'address' references remain")
else:
    print("⚠ WARNING: 'address' still found in file")
    
print(f"\nIf something went wrong, restore from backup:")
print(f"  cp '{backup_path}' '{file_path}'")
