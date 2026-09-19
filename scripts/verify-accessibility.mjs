import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Accessibility regression: ${message}`);
}

const [
  layout,
  accessibilityCss,
  authLayout,
  joinLayout,
  newLayout,
  lessonsLayout,
  sessionsLayout,
  studentLayout,
  pricingRoute,
  pricingPage,
  authControls,
  headerMobileNav,
  studentSession,
  studentResponse,
  teamTask,
  lessonWorkspace,
  lessonPreview,
  lessonLibrary,
  lessonActions,
  teacherSession,
  ai,
  authoring,
  presenterCss,
  gdprRoute,
  cookieConsent,
] = await Promise.all([
  source('app/layout.tsx'),
  source('app/accessibility.css'),
  source('app/auth/layout.tsx'),
  source('app/join/layout.tsx'),
  source('app/new/layout.tsx'),
  source('app/lessons/layout.tsx'),
  source('app/sessions/layout.tsx'),
  source('app/student/layout.tsx'),
  source('app/pricing/page.tsx'),
  source('components/PricingPage.tsx'),
  source('components/AuthControls.tsx'),
  source('components/HeaderMobileNav.tsx'),
  source('components/StudentSession.tsx'),
  source('components/StudentResponseInput.tsx'),
  source('components/TeamTaskResponseInput.tsx'),
  source('components/LessonWorkspace.tsx'),
  source('components/LessonPreview.tsx'),
  source('app/lessons/LessonLibrary.tsx'),
  source('app/lessons/LessonActions.tsx'),
  source('components/TeacherSession.tsx'),
  source('lib/ai.ts'),
  source('lib/accessibility-authoring.ts'),
  source('components/PresenterScoreboard.module.css'),
  source('app/gdpr/page.tsx'),
  source('components/CookieConsent.tsx'),
]);

requirePattern(layout, /<html lang=\{locale\}>/, 'root document must expose the resolved UI locale as the document language.');
requirePattern(layout, /normalizeUiLocale\(requestHeaders\.get\(LOCALE_REQUEST_HEADER\)\)/, 'document language must come from a validated UI locale.');
requirePattern(layout, /className="skip-link"[^>]+href="#main-content"/, 'skip link to main content is missing.');
requirePattern(accessibilityCss, /:focus-visible/, 'global visible keyboard focus style is missing.');
requirePattern(accessibilityCss, /--line-strong:\s*#8b8d94/i, 'form-control boundary contrast token regressed.');
requirePattern(authLayout, /Account – Syllonaut.*Účet – Syllonaut|Účet – Syllonaut.*Account – Syllonaut/s, 'auth routes lost localized specific page titles.');
requirePattern(joinLayout, /Join a lesson – Syllonaut.*Připojit se k hodině – Syllonaut|Připojit se k hodině – Syllonaut.*Join a lesson – Syllonaut/s, 'join routes lost localized specific page titles.');
requirePattern(newLayout, /New lesson – Syllonaut.*Nová lekce – Syllonaut|Nová lekce – Syllonaut.*New lesson – Syllonaut/s, 'new-lesson route lost localized specific page titles.');
requirePattern(lessonsLayout, /My lessons – Syllonaut.*Moje lekce – Syllonaut|Moje lekce – Syllonaut.*My lessons – Syllonaut/s, 'lesson-library routes lost localized specific page titles.');
requirePattern(sessionsLayout, /Control centre – Syllonaut.*Řídicí centrum – Syllonaut|Řídicí centrum – Syllonaut.*Control centre – Syllonaut/s, 'teacher-session routes lost localized specific page titles.');
requirePattern(studentLayout, /Live lesson – student – Syllonaut.*Živá hodina – student – Syllonaut|Živá hodina – student – Syllonaut.*Live lesson – student – Syllonaut/s, 'student routes lost localized specific page titles.');
requirePattern(pricingRoute, /Pricing — Syllonaut.*Ceník — Syllonaut|Ceník — Syllonaut.*Pricing — Syllonaut/s, 'pricing route lost localized specific page titles.');
requirePattern(pricingPage, /aria-pressed=\{audience === 'teachers'\}/, 'pricing audience selection state is not exposed.');
requirePattern(pricingPage, /aria-pressed=\{billing === 'monthly'\}/, 'pricing billing selection state is not exposed.');
requirePattern(pricingPage, /role="status"[^>]+aria-live="polite"/, 'pricing changes are not announced succinctly.');
requirePattern(pricingPage, /HeaderMobileNav/, 'pricing page lost responsive navigation.');
requirePattern(authControls, /role="dialog"/, 'authentication popover lost dialog semantics.');
requirePattern(authControls, /aria-haspopup="dialog"/, 'authentication trigger lost dialog relationship.');
requirePattern(authControls, /event\.key !== 'Escape'/, 'authentication popover lost Escape handling.');
requirePattern(headerMobileNav, /useId\(\)/, 'mobile navigation must keep a unique aria-controls relationship.');
requirePattern(headerMobileNav, /event\.key !== 'Escape'/, 'mobile navigation lost Escape handling.');
requirePattern(headerMobileNav, /triggerRef\.current\?\.focus\(\)/, 'mobile navigation no longer returns focus after Escape.');
requirePattern(studentSession, /role="progressbar"/, 'student live progressbar semantics are missing.');
requirePattern(studentSession, /Aktuální úkol \$\{blockNumber\} z \$\{state\.totalBlocks\}/, 'active lesson-block announcement is missing.');
requirePattern(studentResponse, /aria-pressed=\{selected === option\}/, 'quiz\/poll selected state is not exposed.');
requirePattern(studentResponse, /role="alert"/, 'student response errors are not exposed as alerts.');
requirePattern(teamTask, /Společná týmová odpověď/, 'team response field lost its accessible label.');
requirePattern(teamTask, /aria-describedby=\{statusId\}/, 'team response field lost status description.');
requirePattern(lessonWorkspace, /Pokyn pro úpravu celé lekce/, 'whole-lesson AI revision field lost its label.');
requirePattern(lessonWorkspace, /Pokyn pro úpravu vybrané aktivity/, 'block AI revision field lost its label.');
requirePattern(lessonWorkspace, /builderRef\.current/, 'Edit block must address the desktop builder scroll container.');
requirePattern(lessonWorkspace, /builder\.scrollTo\(/, 'Edit block must scroll the sticky builder itself on desktop.');
requirePattern(lessonWorkspace, /editor\?\.scrollIntoView/, 'Edit block must retain page-scroll fallback for non-scrollable layouts.');
requirePattern(lessonWorkspace, /blockRevisionTextareaRef\.current\?\.focus\(\{ preventScroll: true \}\)/, 'Edit block must move keyboard focus into the block revision field.');
requirePattern(lessonWorkspace, /prefers-reduced-motion: reduce/, 'block-editor navigation must respect reduced-motion preferences.');
requirePattern(lessonPreview, /onEditBlock\(block\.id\)/, 'the explicit Edit block control must use the focus-and-scroll editing action.');
requirePattern(lessonWorkspace, /folderId:\s*initialFolderId/, 'folder-aware generation was lost while applying accessibility changes.');
requirePattern(lessonPreview, /Kontrola přístupnosti obsahu/, 'ATAG authoring feedback is missing from teacher preview.');
requirePattern(lessonPreview, /Jak opravit:/, 'ATAG repair guidance is missing from teacher preview.');
requirePattern(lessonPreview, /Nové \/ upravené.*New \/ updated|New \/ updated.*Nové \/ upravené/s, 'AI revision changes must have a text label and not rely on colour alone.');
requirePattern(lessonWorkspace, /changedBlockIds\(before, revisedLesson\)/, 'successful AI revisions must compute changed blocks for teacher feedback.');
requirePattern(lessonWorkspace, /sessionStorage\.setItem\(key, JSON\.stringify\(blockIds\)\)/, 'latest revision highlights must survive a same-tab reload until the next revision.');
requirePattern(lessonLibrary, /aria-label=\{ui\('Složky lekcí', 'Lesson folders'\)\}/, 'folder navigation lost its localized accessible name.');
requirePattern(lessonLibrary, /aria-pressed=\{scope === root\.id\}/, 'selected lesson-folder state is not exposed.');
requirePattern(lessonLibrary, /aria-pressed=\{selectionMode\}/, 'lesson selection mode state is not exposed.');
requirePattern(lessonLibrary, /Rename folder.*Přejmenovat složku|Přejmenovat složku.*Rename folder/, 'folder icon actions lost localized explicit accessible names.');
requirePattern(lessonLibrary, /role="alert"/, 'lesson-library errors are not exposed as alerts.');
requirePattern(lessonLibrary, /role="dialog"/, 'folder move flow lost dialog semantics.');
requirePattern(lessonLibrary, /aria-modal="true"/, 'folder move dialog must remain modal to assistive technology.');
requirePattern(lessonLibrary, /event\.key !== 'Tab'/, 'folder move dialog lost keyboard focus trapping.');
requirePattern(lessonLibrary, /document\.activeElement === first/, 'folder move dialog no longer loops focus at the first control.');
requirePattern(lessonLibrary, /document\.activeElement === last/, 'folder move dialog no longer loops focus at the last control.');
requirePattern(lessonLibrary, /moveDialogTriggerRef\.current\?\.focus\(\)/, 'folder move dialog no longer returns focus to its trigger.');
requirePattern(lessonLibrary, /Stejný přesun je vždy dostupný i přes nabídku lekce.*Move to|same move is always available.*Přesunout do/is, 'drag-and-drop no longer documents its non-drag alternative.');
requirePattern(lessonActions, /Přesunout do….*Move to|Move to….*Přesunout do/s, 'lesson menu lost the localized non-drag move alternative.');
requirePattern(lessonActions, /role="alert"/, 'lesson action errors are not exposed as alerts.');
requirePattern(teacherSession, /role="progressbar"/, 'teacher live progressbar semantics are missing.');
requirePattern(teacherSession, /Block.*of.*Blok.*z|Blok.*z.*Block.*of/s, 'teacher live progress lacks localized meaningful value text.');
requirePattern(ai, /Pravidla přístupnosti vytvářeného obsahu \(ATAG\/WCAG by default\)/, 'AI authoring accessibility guardrails are missing.');
requirePattern(ai, /caption:\s*z\.string\(\)\.min\(1\)/, 'AI-generated tables no longer require a caption.');
requirePattern(authoring, /drag-only-instruction/, 'deterministic drag-only authoring check is missing.');
requirePattern(authoring, /visual-only-cue/, 'deterministic visual-only authoring check is missing.');
requirePattern(authoring, /unsupported-visual-reference/, 'deterministic unsupported visual-reference check is missing.');
requirePattern(authoring, /suggestion:/, 'ATAG diagnostics no longer provide repair guidance.');
requirePattern(presenterCss, /prefers-reduced-motion:\s*reduce/, 'presenter reduced-motion fallback is missing.');
requirePattern(gdprRoute, /Ochrana osobních údajů \(GDPR\).*Privacy and personal data \(GDPR\)|Privacy and personal data \(GDPR\).*Ochrana osobních údajů \(GDPR\)/s, 'GDPR page lost its localized primary heading.');
requirePattern(cookieConsent, /aria-modal="true"/, 'cookie settings dialog must remain modal to assistive technology.');
requirePattern(cookieConsent, /event\.key !== 'Tab'/, 'cookie settings dialog lost keyboard focus trapping.');

console.log('Accessibility source checks passed.');
