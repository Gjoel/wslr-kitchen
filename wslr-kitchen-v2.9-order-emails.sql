-- WSLR Kitchen v2.9: groundwork for reading supplier order emails
-- (already applied to the database; nothing uses it yet)
-- Orders can come from email, with a reference back to the message, and a
-- log of which emails have been read so none is imported twice.
alter table orders drop constraint if exists orders_source_chk;
alter table orders add constraint orders_source_chk check (source = any (array['manual','sheet','email']));
alter table orders add column if not exists email_ref text;
create index if not exists orders_order_number_idx on orders(order_number);

create table if not exists order_mail_log (
  message_id   text primary key,
  received_at  timestamptz,
  sender       text,
  subject      text,
  supplier     text,
  order_number text,
  order_id     bigint,
  status       text not null default 'done',
  detail       text,
  processed_at timestamptz not null default now()
);
alter table order_mail_log enable row level security;
drop policy if exists anon_read_order_mail_log on order_mail_log;
create policy anon_read_order_mail_log on order_mail_log for select to anon using (true);
