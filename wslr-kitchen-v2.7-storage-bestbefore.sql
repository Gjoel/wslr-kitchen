-- WSLR Kitchen v2.7
-- 1. Three more storage areas: large kitchen fridge, glass bar fridges and the
--    restaurant fridge/freezer. The original three keep their keys (fridge,
--    freezer, dry) and now show in the app as Cool room, Walk in freezer and
--    Walk in pantry.
-- 2. Each stock line can say whether its date is a use by or a best before.
-- Safe to run more than once.

alter table stock_items drop constraint if exists stock_items_storage_check;
alter table stock_items add constraint stock_items_storage_check
  check (storage in ('fridge','freezer','dry','kitchen_fridge','bar_fridge','restaurant'));

alter table order_items drop constraint if exists order_items_storage_check;
alter table order_items add constraint order_items_storage_check
  check (storage in ('fridge','freezer','dry','kitchen_fridge','bar_fridge','restaurant'));

alter table shelf_life_defaults drop constraint if exists shelf_life_defaults_storage_check;
alter table shelf_life_defaults add constraint shelf_life_defaults_storage_check
  check (storage in ('fridge','freezer','dry','kitchen_fridge','bar_fridge','restaurant'));

alter table stock_items add column if not exists expiry_type text default 'use_by';
alter table stock_items drop constraint if exists stock_items_expiry_type_check;
alter table stock_items add constraint stock_items_expiry_type_check
  check (expiry_type is null or expiry_type in ('use_by','best_before'));
