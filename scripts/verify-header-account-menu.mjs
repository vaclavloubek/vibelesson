import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`header account menu regression: ${message}`);
}

const [landing, pricing, authControls, dashboard, workspace, teacherLive, privacy, menu, landingCss, globals] = await Promise.all([
  source('components/LandingPage.tsx'),
  source('components/PricingPage.tsx'),
  source('components/AuthControls.tsx'),
  source('app/lessons/page.tsx'),
  source('components/LessonWorkspace.tsx'),
  source('components/TeacherSession.tsx'),
  source('app/gdpr/page.tsx'),
  source('components/PublicHeaderAccountMenu.tsx'),
  source('components/LandingPage.module.css'),
  source('app/globals.css'),
]);

requireText(authControls, '<PublicHeaderAccountMenu', 'authenticated AuthControls must render the shared account menu.');
requireText(landing, '<AuthControls onAuthChange={setUser} />', 'landing must use the shared auth/account control.');
requireText(pricing, '<AuthControls', 'pricing must use the shared auth/account control.');
requireText(dashboard, '<PublicHeaderAccountMenu', 'dashboard must use the shared account menu.');
requireText(workspace, '<AuthControls onAuthChange={handleAuthChange}', 'lesson workspace must inherit the shared account menu through AuthControls.');
requireText(teacherLive, '<PublicHeaderAccountMenu user={authUser} />', 'teacher live must use the shared account menu when primary auth is available.');
requireText(privacy, '<PublicHeaderAccountMenu user={accountUser} />', 'privacy page must use the shared account menu for signed-in teachers.');

for (const [name, text] of [['dashboard', dashboard], ['workspace', workspace], ['teacher live', teacherLive]]) {
  requireText(text, 'Jak to funguje', `${name} must expose the same primary navigation logic.`);
  requireText(text, 'Ceník', `${name} must expose Pricing in the primary navigation.`);
  requireText(text, 'Moje lekce', `${name} must expose My lessons in the primary navigation.`);
}

requireText(menu, "supabase.rpc('get_ai_quota')", 'the dropdown must keep AI quota information available when quota is not supplied by AuthControls.');
requireText(menu, 'href="/lessons"', 'the dropdown must expose My lessons.');
requireText(menu, '/subscription', 'the dropdown must expose direct subscription management.');
requireText(menu, "fetch('/api/auth/clear-live-resume'", 'standalone logout must clear live-resume state.');
requireText(menu, 'supabase.auth.signOut()', 'standalone logout must terminate the Supabase session.');
requireText(menu, "event.key !== 'Escape'", 'the dropdown must support Escape closing.');
requireText(menu, "document.addEventListener('pointerdown'", 'the dropdown must close on outside pointer interaction.');
requireText(landingCss, ':global(.auth-account-label)', 'the public mobile header must compact the profile trigger.');
requireText(globals, '.auth-account-popover', 'global account dropdown styling must exist.');
requireText(globals, '.app-header-cta', 'teacher surfaces must share a compact primary header CTA style.');

console.log('Header account menu checks passed.');
