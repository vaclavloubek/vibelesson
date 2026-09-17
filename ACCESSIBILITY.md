# Syllonaut accessibility baseline

Syllonaut treats accessibility as a product and release requirement, not as a one-off audit.

## Engineering baseline

For new development, Syllonaut targets:

- WCAG 2.2 Level AA for the web application and live teaching surfaces;
- EN 301 549 as the European ICT accessibility reference, using the newest applicable requirements as an engineering baseline while separately tracking which edition is legally harmonised;
- ATAG 2.0 principles because Syllonaut is also an authoring tool: the application itself should be accessible and it should help teachers create accessible lesson content.

Primary references:

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WCAG-EM: https://www.w3.org/TR/WCAG-EM/
- ATAG 2.0: https://www.w3.org/TR/ATAG20/
- WAI-ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/

Passing automated tests does **not** mean that the product is conformant. Accessibility conformance requires manual evaluation as well.

## Automated release gates

Pull requests run:

1. TypeScript and existing project checks;
2. `npm run check:accessibility`, which protects critical accessibility contracts in source code;
3. axe checks on the public routes `/`, `/pricing`, `/join` and `/new`, using WCAG A/AA rule tags including WCAG 2.2 AA.

Automated tests are intended to catch regressions such as missing names, roles, states, focus affordances, landmarks and selected-state semantics. They cannot validate the whole user experience or all WCAG success criteria.

## Manual release checklist

Before a wider public release, test representative end-to-end flows rather than isolated pages.

### Keyboard only

- Reach the skip link immediately and move to the main content.
- Complete sign-in/sign-up/recovery without a pointer.
- Open and close the authentication popover with the keyboard; Escape closes it and focus returns to the trigger.
- Open and close the responsive navigation with the keyboard; Escape closes it and focus returns to the menu trigger.
- Create a lesson, switch teacher/student preview, select and revise a block.
- Navigate the lesson library and folders, including create/rename/delete/move controls.
- Join a live lesson as a student and complete poll, quiz, ranking, open-text, exit-ticket and team-task flows.
- Run the teacher live controls, timer and result reveal without a pointer.
- Verify that focus never disappears visually or becomes trapped unintentionally.

### Screen readers

Minimum representative combinations:

- VoiceOver + Safari on macOS;
- VoiceOver + Safari on iOS;
- NVDA + Chrome on Windows;
- NVDA + Firefox on Windows.

Verify especially:

- page titles and Czech document language;
- field labels, descriptions, invalid states and error announcements;
- selected poll/quiz/team/folder/pricing state;
- active live block announcement;
- autosave and collaborative lock status;
- progress values and timer milestones;
- table captions and column headers;
- result reveal, score and connection-status announcements;
- authentication focus entry, Escape close and focus return;
- responsive navigation name, expanded state and focus return.

### Zoom, reflow and text

At minimum test:

- browser zoom at 200%;
- browser zoom at 400%;
- narrow mobile viewport around 320 CSS px;
- text enlargement where supported;
- portrait and landscape on a phone-size viewport.

No essential control or information may disappear, overlap in a way that blocks use, or require two-dimensional scrolling except where the content itself legitimately needs it (for example a wide data table).

### Motion and visual perception

- Test with `prefers-reduced-motion: reduce`.
- Verify text contrast and non-text contrast after visual redesigns.
- Do not use colour, position, shape, animation or sound as the only way to communicate meaning.
- Ensure keyboard focus is visible in both light and dark/live surfaces.

## ATAG authoring requirements

AI generation and AI revision must preserve the following defaults:

- student instructions make sense as standalone text;
- no task depends only on colour, shape, location, animation or sound;
- ranking tasks are phrased in a way that does not require drag-and-drop;
- essential information is available textually rather than requiring an oral explanation by the teacher;
- tabular datasets use real table structures and a meaningful caption;
- future meaningful images require a text alternative or an explicit authoring step to provide one;
- inaccessible patterns should be detected and surfaced to the teacher before live use when practical;
- detected issues should include concrete repair guidance rather than only a generic warning.

The teacher preview currently performs deterministic checks for missing table captions, drag-only wording, obvious visual-only cues and references to unsupported or potentially undescribed images, graphs or diagrams. Each finding includes a suggested repair. These checks are intentionally conservative and are not a substitute for human review.

## Regression policy

When a new interactive component is added, the same change should include:

- an accessible name;
- correct semantic role and state;
- keyboard operation;
- visible focus;
- status/error announcements when content changes dynamically;
- sufficient target size and contrast;
- reduced-motion behaviour if motion is introduced;
- an accessibility regression assertion or browser test when the behaviour is critical.

When a new authoring/content type is added, assess both sides of ATAG: whether the editing UI is accessible and whether the resulting student content can be accessible.

## Conformance language

Do not publish a blanket statement that Syllonaut "conforms to WCAG 2.2 AA" until a representative WCAG-EM evaluation has been completed and documented. Until then, describe WCAG 2.2 AA as the engineering target and list known limitations transparently.
