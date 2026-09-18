create index billing_prices_plan_code_idx
  on public.billing_prices (plan_code);

create index billing_subscriptions_plan_code_idx
  on public.billing_subscriptions (plan_code);

create index billing_subscriptions_price_fk_idx
  on public.billing_subscriptions (provider, livemode, external_price_id);

create index profiles_active_plan_code_idx
  on public.profiles (active_plan_code);
