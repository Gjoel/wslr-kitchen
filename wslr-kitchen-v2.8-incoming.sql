-- WSLR Kitchen v2.8: Incoming orders
-- The order number each order came in on, and the pack size of each line
-- (e.g. 500 g, 2 kg, 1 L), so the Incoming tab can show both.
-- Safe to run more than once.
alter table orders add column if not exists order_number text;
alter table order_items add column if not exists size text;
-- nothing is required on an order either
alter table orders alter column supplier drop not null;
