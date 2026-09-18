#!/usr/bin/env node

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '554871574';
const APPLY = process.argv.includes('--apply');
const ANALYTICS_EDIT_SCOPE = 'https://www.googleapis.com/auth/analytics.edit';

const customDimensions = [
  ['CTA location', 'location', 'Where the lesson-preparation CTA was clicked.'],
  ['Pricing segment', 'segment', 'Teacher or school pricing segment.'],
  ['Billing period', 'billing_period', 'Monthly or annual pricing context.'],
  ['Activity type', 'activity_type', 'Low-cardinality Syllonaut activity type.'],
  ['Activity mode', 'activity_mode', 'Individual, team, or shared activity mode.'],
  ['Revision scope', 'revision_scope', 'Whole-lesson or single-activity AI revision.'],
  ['Has materials', 'has_materials', 'Whether source materials were used for generation.'],
  ['Material mode', 'material_mode', 'How uploaded source materials were used.'],
  ['Duration bucket', 'duration_bucket', 'Bucketed planned lesson duration.'],
  ['Block count bucket', 'block_count_bucket', 'Bucketed number of lesson blocks.'],
  ['Participant count bucket', 'participant_count_bucket', 'Bucketed live-session participant count.'],
  ['Failure stage', 'failure_stage', 'Low-cardinality lesson-generation failure stage.'],
  ['Error code', 'error_code', 'Low-cardinality product analytics error code.'],
  ['Session state', 'session_state', 'Lobby, live, or ended session state.'],
  ['Grading result state', 'result_state', 'AI grading result state.'],
].map(([displayName, parameterName, description]) => ({
  displayName,
  parameterName,
  description,
  scope: 'EVENT',
}));

const keyEvents = [
  'signup_completed',
  'lesson_generation_completed',
  'live_session_started',
].map((eventName) => ({
  eventName,
  countingMethod: 'ONCE_PER_EVENT',
}));

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function accessTokenFromServiceAccount(credentialsPath) {
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Service account JSON is missing client_email or private_key.');
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: ANALYTICS_EDIT_SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));

  const signer = createSign('RSA-SHA256');
  signer.update(header + '.' + payload);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString('base64url');
  const assertion = header + '.' + payload + '.' + signature;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error('OAuth token exchange failed (' + response.status + '): ' + JSON.stringify(body));
  }
  return body.access_token;
}

async function getAccessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
    return process.env.GOOGLE_OAUTH_ACCESS_TOKEN.trim();
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return accessTokenFromServiceAccount(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  throw new Error(
    'Missing Google authorization. Set GOOGLE_OAUTH_ACCESS_TOKEN to a short-lived OAuth token, ' +
    'or GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path. The credential must have ' +
    'Google Analytics property Editor access and the analytics.edit scope.'
  );
}

async function api(token, path, options = {}) {
  const response = await fetch('https://analyticsadmin.googleapis.com/v1beta' + path, {
    ...options,
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = body?.error?.message || text || response.statusText;
    throw new Error((options.method || 'GET') + ' ' + path + ' failed (' + response.status + '): ' + detail);
  }
  return body;
}

async function listAll(token, collection) {
  const items = [];
  let pageToken = '';

  do {
    const query = new URLSearchParams({ pageSize: '200' });
    if (pageToken) query.set('pageToken', pageToken);
    const body = await api(token, '/properties/' + PROPERTY_ID + '/' + collection + '?' + query);
    items.push(...(body?.[collection] || []));
    pageToken = body?.nextPageToken || '';
  } while (pageToken);

  return items;
}

async function createCustomDimension(token, dimension) {
  return api(token, '/properties/' + PROPERTY_ID + '/customDimensions', {
    method: 'POST',
    body: JSON.stringify(dimension),
  });
}

async function createKeyEvent(token, keyEvent) {
  return api(token, '/properties/' + PROPERTY_ID + '/keyEvents', {
    method: 'POST',
    body: JSON.stringify(keyEvent),
  });
}

async function patchKeyEvent(token, existing) {
  return api(token, '/' + existing.name + '?updateMask=counting_method', {
    method: 'PATCH',
    body: JSON.stringify({
      name: existing.name,
      countingMethod: 'ONCE_PER_EVENT',
    }),
  });
}

function printPlan(plan) {
  console.log('GA4 property: ' + PROPERTY_ID);
  console.log(APPLY ? 'Mode: APPLY' : 'Mode: DRY RUN');
  console.log('');

  if (plan.length === 0) {
    console.log('No changes needed. GA4 configuration already matches Syllonaut analytics taxonomy.');
    return;
  }

  for (const item of plan) {
    console.log('- ' + item.action + ': ' + item.label);
  }

  if (!APPLY) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to make these changes.');
  }
}

async function main() {
  if (!/^\d+$/.test(PROPERTY_ID)) {
    throw new Error('GA4_PROPERTY_ID must be numeric, got: ' + PROPERTY_ID);
  }

  const token = await getAccessToken();

  const [existingDimensions, existingKeyEvents] = await Promise.all([
    listAll(token, 'customDimensions'),
    listAll(token, 'keyEvents'),
  ]);

  const dimensionsByParameter = new Map(
    existingDimensions.map((item) => [item.parameterName, item])
  );
  const keyEventsByName = new Map(
    existingKeyEvents.map((item) => [item.eventName, item])
  );

  const plan = [];

  for (const dimension of customDimensions) {
    const existing = dimensionsByParameter.get(dimension.parameterName);
    if (!existing) {
      plan.push({
        action: 'CREATE DIMENSION',
        label: dimension.displayName + ' (' + dimension.parameterName + ')',
        run: () => createCustomDimension(token, dimension),
      });
    }
  }

  for (const keyEvent of keyEvents) {
    const existing = keyEventsByName.get(keyEvent.eventName);
    if (!existing) {
      plan.push({
        action: 'CREATE KEY EVENT',
        label: keyEvent.eventName + ' [ONCE_PER_EVENT]',
        run: () => createKeyEvent(token, keyEvent),
      });
    } else if (existing.countingMethod !== 'ONCE_PER_EVENT') {
      plan.push({
        action: 'UPDATE KEY EVENT',
        label: keyEvent.eventName + ': ' + (existing.countingMethod || 'unspecified') + ' -> ONCE_PER_EVENT',
        run: () => patchKeyEvent(token, existing),
      });
    }
  }

  printPlan(plan);
  if (!APPLY || plan.length === 0) return;

  console.log('');
  for (const item of plan) {
    process.stdout.write(item.action + ': ' + item.label + ' ... ');
    await item.run();
    console.log('OK');
  }

  const [verifiedDimensions, verifiedKeyEvents] = await Promise.all([
    listAll(token, 'customDimensions'),
    listAll(token, 'keyEvents'),
  ]);

  const missingDimensions = customDimensions.filter(
    (wanted) => !verifiedDimensions.some((actual) => actual.parameterName === wanted.parameterName)
  );
  const invalidKeyEvents = keyEvents.filter((wanted) => {
    const actual = verifiedKeyEvents.find((item) => item.eventName === wanted.eventName);
    return !actual || actual.countingMethod !== 'ONCE_PER_EVENT';
  });

  if (missingDimensions.length || invalidKeyEvents.length) {
    throw new Error(
      'Verification failed. Missing dimensions: ' +
      (missingDimensions.map((x) => x.parameterName).join(', ') || 'none') +
      '; invalid key events: ' +
      (invalidKeyEvents.map((x) => x.eventName).join(', ') || 'none') +
      '.'
    );
  }

  console.log('');
  console.log('Verification passed: all 15 custom dimensions and 3 key events are configured.');
}

main().catch((error) => {
  console.error('');
  console.error('GA4 setup failed: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
