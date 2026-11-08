-- FINANCE-STATEMENT-002 (Marc, Nov 8 2026): card cashback is its own revenue line,
-- "Interest income (card cashback)", so "Other" stays empty.
update public.finance_vendor_rules
   set item = 'Interest income (card cashback)', purpose = 'Mercury card cashback. Counted as interest income.'
 where match_counterparty = 'Mercury IO Cashback' and section = 'Revenue';
