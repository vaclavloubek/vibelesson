import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../components/LandingMobileCta.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../components/LandingMobileCta.module.css', import.meta.url), 'utf8');
const landing = await readFile(new URL('../components/LandingPage.tsx', import.meta.url), 'utf8');

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(`Landing mobile CTA regression: ${message}`);
}

requirePattern(component, /^'use client';/, 'the sticky bar must be a client component.');
requirePattern(component, /IntersectionObserver/, 'visibility must follow the hero CTA, closing CTA and contact form via IntersectionObserver.');
requirePattern(component, /'hero-cta'[\s\S]*'pripravit-hodinu'[\s\S]*'kontakt'/, 'the bar must hide while the hero CTA, #pripravit-hodinu or #kontakt is on screen.');
requirePattern(component, /href="\/new"/, 'the bar must lead to lesson preparation.');
requirePattern(component, /location: 'mobile_sticky'/, "clicks must be tracked with location 'mobile_sticky'.");
requirePattern(component, /aria-hidden=\{visible \? undefined : 'true'\}/, 'the hidden bar must be hidden from assistive technology.');
requirePattern(component, /tabIndex=\{visible \? undefined : -1\}/, 'the hidden bar link must leave the tab order.');

requirePattern(styles, /env\(safe-area-inset-bottom/, 'the bar must respect the bottom safe area.');
requirePattern(styles, /@media \(max-width: 720px\)/, 'the bar must only appear on mobile widths.');
requirePattern(styles, /z-index: 25;/, 'the bar must stay below the cookie banner and back-to-top button.');
requirePattern(styles, /prefers-reduced-motion: reduce/, 'the bar must not animate for reduced-motion users.');

requirePattern(landing, /import LandingMobileCta from '@\/components\/LandingMobileCta';/, 'LandingPage must import the sticky bar.');
requirePattern(landing, /<LandingMobileCta label=\{t\.prepare\} \/>/, 'LandingPage must render the sticky bar with the existing prepare copy.');
requirePattern(landing, /id="hero-cta"/, 'the hero CTA must carry id="hero-cta" for the observer.');

console.log('Landing mobile CTA source checks passed.');
