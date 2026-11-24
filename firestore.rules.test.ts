import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Phase 0 Static Contract Verification for the Dirty Dozen security assertions.
 * Verifies that firestore.rules enforces every required guard from security_spec.md.
 */
test('firestore.rules enforces default deny, PII isolation, Master Gate, and Eight Pillars', () => {
  const rules = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

  // 1. Default deny catch-all at top
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);

  // 2. Verified email & ID regex helpers
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);

  // 3. No blanket isSignedIn() list or read on users
  assert.doesNotMatch(rules, /allow read:\s*if isSignedIn\(\)/);
  assert.match(rules, /match \/users\/\{userId\}[\s\S]*allow list:\s*if false;/);

  // 4. Master Gate parent existence check for subcollections
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);

  // 5. All 4 subcollections present with validation helpers and query enforcer
  for (const col of ['clarifySessions', 'flashcards', 'confidenceLogs', 'voiceSessions']) {
    assert.ok(rules.includes(`match /${col}/`), `Missing match block for ${col}`);
  }
  assert.match(rules, /resource\.data\.ownerId == request\.auth\.uid/);
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);
});
