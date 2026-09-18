update public.billing_prices
set external_price_id = 'price_1UH434AgkxhGI3t12C90pnOT',
    updated_at = now()
where provider = 'stripe'
  and livemode = false
  and external_price_id = 'price_1UH434AgkxhGI3t1oVoZlVQA'
  and plan_code = 'teacher_pro'
  and billing_period = 'monthly'
  and currency = 'usd';
