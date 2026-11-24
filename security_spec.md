# SIMPLI Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Every unmatched path under `/databases/{database}/documents` is denied for all reads and writes.
2. **PII Isolation**: `/users/{userId}` holds email and profile info and can only be read (`get`) or written by `request.auth.uid == userId`. Cross-user `list` on `/users` is forbidden.
3. **Master Gate on Subcollections**: Every subcollection under `/users/{userId}` (`clarifySessions`, `flashcards`, `confidenceLogs`, `voiceSessions`) checks parent `/users/{userId}` existence on `create` and validates strict path ownership (`userId == request.auth.uid`) plus verified email (`request.auth.token.email_verified == true`).
4. **Immutable Ownership & Timestamps**: `ownerId`, `uid`, `id`, and `createdAt` cannot be modified after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Bounded Payloads & Strict Keys**: Every create uses `hasAll()` + `hasOnly()`; every update uses `affectedKeys().hasOnly()`; every string has `.size()` caps and IDs match `^[a-zA-Z0-9_-]+$`; `madeSimple` array is capped at `<= 10` items and type-checked.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated read/write** to `/users/userA/flashcards/fc1` -> `PERMISSION_DENIED`.
2. **Cross-user read (`get` or `list`)** by `userB` on `/users/userA` or `/users/userA/clarifySessions` -> `PERMISSION_DENIED`.
3. **Unverified email write**: `userA` with `email_verified: false` creating `/users/userA/flashcards/fc1` -> `PERMISSION_DENIED`.
4. **Shadow field ("ghost key") injection**: `isAdmin: true` or `role: 'admin'` in `/users/userA` -> `PERMISSION_DENIED` (`hasOnly` rejection).
5. **Identity spoofing**: `userA` writing `ownerId: 'userB'` inside `/users/userA/clarifySessions/s1` -> `PERMISSION_DENIED`.
6. **ID poisoning**: Document ID exceeding 128 chars or containing spaces/slashes `../bad` -> `PERMISSION_DENIED`.
7. **Orphan subcollection write**: Writing `/users/userA/flashcards/fc1` before `/users/userA` exists -> `PERMISSION_DENIED` (Master Gate `exists()` check).
8. **Forged client timestamp**: `createdAt` set to a past string or client Date instead of `request.time` -> `PERMISSION_DENIED`.
9. **Immutable field tampering on update**: Changing `ownerId` or `createdAt` during an update -> `PERMISSION_DENIED`.
10. **Oversized string DoW ("Denial of Wallet")**: `theGist` > 2000 chars or `question` > 600 chars -> `PERMISSION_DENIED`.
11. **Array flooding / invalid element type**: `madeSimple` with 15 elements or `[123]` non-string -> `PERMISSION_DENIED`.
12. **Blanket `list` query without owner enforcement**: Listing `/users` or subcollection where `resource.data.ownerId != request.auth.uid` -> `PERMISSION_DENIED`.
