## [2.0.2](https://github.com/acoustic-/poll-a-lot/compare/v2.0.1...v2.0.2) (2026-11-14)

### Bug Fixes

* **movie-poll-item:** edit button back below the creator name in condensed view ([18088db](https://github.com/acoustic-/poll-a-lot/commit/18088db356b6f8789d1a6647f23e014eb64ba537)), closes [#67](https://github.com/acoustic-/poll-a-lot/issues/67)

## [2.0.1](https://github.com/acoustic-/poll-a-lot/compare/v2.0.0...v2.0.1) (2026-11-14)

### Bug Fixes

* **deps:** refresh functions lockfile to patch express/body-parser/proxy-addr/grpc/busboy advisories ([8bc26f4](https://github.com/acoustic-/poll-a-lot/commit/8bc26f441e9f82afd3436bc43e435d92395ef78f))
* **deps:** refresh root lockfile to patch Angular, undici, vite, sharp and tooling advisories ([cdcc787](https://github.com/acoustic-/poll-a-lot/commit/cdcc787b9c7a8faddd2253325f1c9fa8247f7cbf))

## [2.0.0](https://github.com/acoustic-/poll-a-lot/compare/v1.4.0...v2.0.0) (2026-11-14)

### ⚠ BREAKING CHANGES

* **auth:** Firestore rules reject unauthenticated writes. Stale client
builds (for example a cached PWA) can no longer vote, add items or duel until
reloaded. Anonymous sign-in must be enabled in the Firebase console before this
is deployed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

### Features

* **auth:** nickname users sign in with Firebase Anonymous Auth ([a0bf95e](https://github.com/acoustic-/poll-a-lot/commit/a0bf95efd83335c34f55bc9e96b483b0a95d579d))
* **rules:** tighten pollItems rules (creator/owner/lock) with emulator tests ([0f1a379](https://github.com/acoustic-/poll-a-lot/commit/0f1a37968c2e8698fbc6681429a8f21ea6b32622))

### Bug Fixes

* **auth:** defer queued writes past the auth callback; update e2e for uid-keyed data ([52b4992](https://github.com/acoustic-/poll-a-lot/commit/52b4992ad814fe6dd7fc6d56e80796c0135acb8c))

## [1.4.0](https://github.com/acoustic-/poll-a-lot/compare/v1.3.1...v1.4.0) (2026-11-14)

### Features

* **duels:** cap each voter's group influence at the per-voter budget ([cad3192](https://github.com/acoustic-/poll-a-lot/commit/cad3192ca8c4409e3dac3b0ef1f7a35df461ab7e))
* **duels:** first-time 'how duels work' intro; one remove-permission rule ([f9c8c33](https://github.com/acoustic-/poll-a-lot/commit/f9c8c3341a9a74cb24ceef2b9d217587386aa571))
* **duels:** guided intro over the live arena with spotlighted controls ([7e40710](https://github.com/acoustic-/poll-a-lot/commit/7e40710ef6d382aa1246489d5c044aa1007a9dce))
* **duels:** weight each voter's picks equally in the Bradley-Terry fit ([664e9ad](https://github.com/acoustic-/poll-a-lot/commit/664e9adf55b818f3a0795a50a451177d91cf0d20))

### Bug Fixes

* **add,remove,identity:** fourth round of review fixes ([61349f9](https://github.com/acoustic-/poll-a-lot/commit/61349f94ad737d7e8a17b2c6793c87fbfee3b14e))
* **add,undo:** films added from the movie/search dialogs also clear the generated description ([73a52c3](https://github.com/acoustic-/poll-a-lot/commit/73a52c33a7e736156c27a9eee992cff9ac8ad942))
* **duels,add,undo:** second round of review fixes ([22444f7](https://github.com/acoustic-/poll-a-lot/commit/22444f73e2b821d9f0e6fe4acb36a376fce1612f))
* **duels,add,undo:** third round of review fixes ([2fec504](https://github.com/acoustic-/poll-a-lot/commit/2fec5045cec9ec07402f5c379e27fa1cd8ff1a74))
* **duels,card:** address review findings on placement budget, skip, ownership and remove flow ([5ebc192](https://github.com/acoustic-/poll-a-lot/commit/5ebc192aaa21e52ab203efe80e1746be90ab8f95))
* **duels,card:** undo no longer locks picking; card menu ownership, locked and creator-row gating ([aab0a4c](https://github.com/acoustic-/poll-a-lot/commit/aab0a4cccc47327f4403e825852f95b31b411040))
* **duels,remove:** intro Escape/seen handling; random-pick removal only for those who may remove ([2a5a038](https://github.com/acoustic-/poll-a-lot/commit/2a5a038b499751ef6b2765f19b24f1a8199b48c3))
* **duels,undo,add:** intro inert + focus, offline-safe undo, clear text input after add ([e7d503b](https://github.com/acoustic-/poll-a-lot/commit/e7d503bef631a6fe4e425be686dc6fcbfd4ffb25))
* **duels,undo,remove:** hide intro help on the complete card; ignore emptied reactions in undo; say why a locked poll can't remove ([d207e82](https://github.com/acoustic-/poll-a-lot/commit/d207e82e97b941dc51a8db520eaf1e99259d6e7c))
* **duels:** drop confusing non-null assertion in unplacedItems ([2591498](https://github.com/acoustic-/poll-a-lot/commit/2591498d3aaca175537bfd028672bc95b2cfe0b1))
* **duels:** smooth the intro's circling loops ([80f1dac](https://github.com/acoustic-/poll-a-lot/commit/80f1dacd358b1eea38ec004e66f2445053b1a22e))
* **lint:** use an interface for the spec's Gate shape ([1712a2c](https://github.com/acoustic-/poll-a-lot/commit/1712a2cc3170275e554de486c5d9bc758ff5db43))
* **remove,duels:** seventh round of review fixes ([019e838](https://github.com/acoustic-/poll-a-lot/commit/019e838d718962fb8241a2eb98dafe0d1aa22bda))
* **undo,duels:** sixth round of review fixes ([360046c](https://github.com/acoustic-/poll-a-lot/commit/360046c03228e5e5a6707823df932546f4af12d5))
* **undo,remove,duels:** fifth round of review fixes ([27ef650](https://github.com/acoustic-/poll-a-lot/commit/27ef650527d8b8369e4eac74fcbec0aa78cf1226))
* **undo:** drop unreachable branch that broke the type-check ([2239cab](https://github.com/acoustic-/poll-a-lot/commit/2239cab10697ff7d616630a5ae9b5528505e6b95))

## [1.3.1](https://github.com/acoustic-/poll-a-lot/compare/v1.3.0...v1.3.1) (2026-09-17)

### Bug Fixes

* **movie-poll-item:** improve UI responsiveness and adjust layout for better visibility ([0157eab](https://github.com/acoustic-/poll-a-lot/commit/0157eab8ffd0159a2977a85132da140acdc96235))

## [1.3.0](https://github.com/acoustic-/poll-a-lot/compare/v1.2.1...v1.3.0) (2026-09-13)

### Features

* **duels:** enhance duel reel with chase icons and improved animations ([45a6070](https://github.com/acoustic-/poll-a-lot/commit/45a607055740b0e65a2b6739dd5843109d46df6e))
* **duels:** enhance duel view with animated round counter and progress reel ([06ec0bc](https://github.com/acoustic-/poll-a-lot/commit/06ec0bc0fde696b7ac26a0782c3a52c6d3f80892))

### Bug Fixes

* **duel-view:** update chaseSlots type to readonly array for better type safety ([f39255f](https://github.com/acoustic-/poll-a-lot/commit/f39255f4a5fcfc1105c9f9ea177c7f7756f5408e))

## [1.2.1](https://github.com/acoustic-/poll-a-lot/compare/v1.2.0...v1.2.1) (2026-09-08)

## [1.2.0](https://github.com/acoustic-/poll-a-lot/compare/v1.1.0...v1.2.0) (2026-09-08)

### Features

* **duels:** arena redesign — ticket stub, genre HUD, backdrop tint ([444687d](https://github.com/acoustic-/poll-a-lot/commit/444687d588b4ecc50be900c9899fb5c6a15a2700))
* **duels:** sink seen/hidden movies, fix poll-type conversion, persist toggles ([0bffc73](https://github.com/acoustic-/poll-a-lot/commit/0bffc734af2bc64389d195a13f1e5b903195bef6))
* **duels:** undo last pick + resilient duel reset ([d9ac0f4](https://github.com/acoustic-/poll-a-lot/commit/d9ac0f4666f5219622e5472faedfed7024104f26))

## [1.1.0](https://github.com/acoustic-/poll-a-lot/compare/v1.0.4...v1.1.0) (2026-09-06)

### Features

* **duels:** prefetch upcoming pairs, snappier PICK, roomier poll-item title ([e359831](https://github.com/acoustic-/poll-a-lot/commit/e359831821ed9b926a3acd471f19cc4488f40f6c))
* **poll:** Ranked Duels voting mode ([4e99e02](https://github.com/acoustic-/poll-a-lot/commit/4e99e0202969cbdf4990eb1e34c902d39113b0f1))

### Bug Fixes

* avatar-stack width, poll-item runtime/edit-button, optional description, welcome copy ([b640c82](https://github.com/acoustic-/poll-a-lot/commit/b640c82ca7ff82d3be3be8a2d1053cfb2af4f95d))

## [1.0.4](https://github.com/acoustic-/poll-a-lot/compare/v1.0.3...v1.0.4) (2026-08-30)

## [1.0.3](https://github.com/acoustic-/poll-a-lot/compare/v1.0.2...v1.0.3) (2026-08-29)

## [1.0.2](https://github.com/acoustic-/poll-a-lot/compare/v1.0.1...v1.0.2) (2026-08-29)

## [1.0.1](https://github.com/acoustic-/poll-a-lot/compare/v1.0.0...v1.0.1) (2026-08-27)

## 1.0.0 (2026-08-23)
