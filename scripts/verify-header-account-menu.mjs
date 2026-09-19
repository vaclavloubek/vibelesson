import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`header account menu regression: ${message}`);
}

const [landing, pricing, menu, landingCss, globals] = await Promise.all([
  source('components/LandingPage.tsx'),
  source('components/PricingPage.tsx'),
  source('components/PublicHeaderAccountMenu.tsx'),
  source('components/LandingPage.module.css'),
  source('app/globals.css'),
]);

requireText(landing, '<PublicHeaderAccountMenu user={user} />', 'landing must render the compact signed-in account menu.');
requireText(pricing, '<PublicHeaderAccountMenu user={user} />', 'pricing must render the compact signed-in account menu.');
requireText(menu, "supabase.rpc('get_ai_quota')", 'the dropdown must keep AI quota information available.');
requireText(menu, 'href="/lessons"', 'the dropdown must expose My lessons.');
requireText(menu, "/pricing", 'the dropdown must expose subscription/pricing.');
requireText(menu, "fetch('/api/auth/clear-live-resume'", 'logout must clear live-resume state.');
requireText(menu, 'supabase.auth.signOut()', 'logout must terminate the Supabase session.');
requireText(menu, "event.key !== 'Escape'", 'the dropdown must support Escape closing.');
requireText(menu, "document.addEventListener('pointerdown'", 'the dropdown must close on outside pointer interaction.');
requireText(landingCss, ':global(.auth-signed-in)', 'the legacy signed-in strip must be hidden in public headers.');
requireText(landingCss, ':global(.auth-account-label)', 'the mobile header must compact the profile trigger.');
requireText(globals, '.auth-account-popover', 'global account dropdown styling must exist.');

console.log('Header account menu checks passed.');
