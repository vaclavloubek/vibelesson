insert into public.billing_prices (
  provider, livemode, external_price_id, plan_code, billing_period, currency, active
) values
  ('stripe', true, 'price_1UHHMRArYiDuwS3OiGRj4lxa', 'teacher', 'monthly', 'czk', true),
  ('stripe', true, 'price_1UHHMTArYiDuwS3O1bABDLzb', 'teacher', 'annual', 'czk', true),
  ('stripe', true, 'price_1UHHMVArYiDuwS3OnKrG0N4p', 'teacher', 'monthly', 'eur', true),
  ('stripe', true, 'price_1UHHMWArYiDuwS3Olo7gVivV', 'teacher', 'annual', 'eur', true),
  ('stripe', true, 'price_1UHHMYArYiDuwS3OpGG1B7Do', 'teacher', 'monthly', 'usd', true),
  ('stripe', true, 'price_1UHHMaArYiDuwS3O4eXUjGGM', 'teacher', 'annual', 'usd', true),
  ('stripe', true, 'price_1UHHMbArYiDuwS3OQhuKB7Z1', 'teacher_pro', 'monthly', 'czk', true),
  ('stripe', true, 'price_1UHHMdArYiDuwS3O9fEDskF5', 'teacher_pro', 'annual', 'czk', true),
  ('stripe', true, 'price_1UHHMfArYiDuwS3OgsskP07M', 'teacher_pro', 'monthly', 'eur', true),
  ('stripe', true, 'price_1UHHMgArYiDuwS3Olflyk81n', 'teacher_pro', 'annual', 'eur', true),
  ('stripe', true, 'price_1UHHMiArYiDuwS3OiQaiicH6', 'teacher_pro', 'monthly', 'usd', true),
  ('stripe', true, 'price_1UHHMjArYiDuwS3OcBynwLGq', 'teacher_pro', 'annual', 'usd', true);

comment on table public.billing_prices is
  'Server-authoritative Stripe Price mapping. livemode is part of the trust boundary; sandbox and live Price IDs must never be mixed.';
