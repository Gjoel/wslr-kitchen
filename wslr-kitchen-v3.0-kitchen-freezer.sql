-- WSLR Kitchen v3.0
-- A fifth storage area: the kitchen freezer (key kitchen_freezer).
-- Already applied to the live database. Safe to run more than once.

alter table stock_items drop constraint if exists stock_items_storage_check;
alter table stock_items add constraint stock_items_storage_check
  check (storage in ('fridge','freezer','dry','kitchen_fridge','kitchen_freezer','bar_fridge','restaurant'));

alter table order_items drop constraint if exists order_items_storage_check;
alter table order_items add constraint order_items_storage_check
  check (storage in ('fridge','freezer','dry','kitchen_fridge','kitchen_freezer','bar_fridge','restaurant'));

alter table shelf_life_defaults drop constraint if exists shelf_life_defaults_storage_check;
alter table shelf_life_defaults add constraint shelf_life_defaults_storage_check
  check (storage in ('fridge','freezer','dry','kitchen_fridge','kitchen_freezer','bar_fridge','restaurant'));

-- the kitchen freezer starts with the same shelf lives as the walk in freezer
insert into shelf_life_defaults (category, storage, days)
select category, 'kitchen_freezer', days from shelf_life_defaults f
where storage = 'freezer'
  and not exists (select 1 from shelf_life_defaults k where k.category = f.category and k.storage = 'kitchen_freezer');
