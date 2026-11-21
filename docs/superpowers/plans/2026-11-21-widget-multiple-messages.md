# Multiple complete widget messages

**Goal:** Android/Harmony show the oldest complete messages that fit, and acknowledge only those messages.

**Architecture:** Server returns an ordered bounded queue while retaining the legacy `item`. New batch acknowledgement validates all identities atomically and refuses chat-read advancement across an undisplayed unread message. Android measures native text against conservative widget bounds; Harmony reports the real body-area dimensions to its native form extension and measures text there. Neither client acknowledges a partially displayed message.

**Constraints:** Keep display1.9.0; native build codes increase only for new packages. Packages in ../love-app, preserve older packages. No push/deploy. Implement in this session without delegation.

- [x] Server `widget.mjs`: bounded `items` queue; `/api/widget/read-batch`; old single read remains compatible. Test interleaved sources, long/unshown tail, restored notes, stale chat gaps, duplicates, foreign-account IDs, transaction rollback.
- [x] Android `WidgetMessages.java`, `OurDaysWidget.java`, `WidgetSyncService.java`: real StaticLayout fit, whole-message prefix, explicit fixed font, immutable batch PendingIntent identity; hide read if no full message fits. Test native measurements and mixed batch payloads.
- [x] Harmony `WidgetModel`, `HarmonyWidget`, `OurDaysCard`, `OurDaysFormAbility`: actual body geometry event, per-form native text measurement, fixed font and selected batch in read event; preserve refresh/read feedback and old events. Test sizing, no partial ack, system event envelope and real backend batch.
- [x] Build and verify both packages; native emulator/device checks where available; report offline/server compatibility limitations.

**Review focus:** Emoji/newlines/font scaling, tiny cards and extremely long first messages, resize after previous render, incoming messages between render and click, concurrent/repeated reads and account/session changes. Retain complete text in source state; if a single message cannot fit at10sp/fp, show an open-app prompt and no read action.


## Verification results

- Full regression:153 passed,0 failed; final targeted widget/Harmony regression:42 passed,0 failed.
- Actual Android synchronization service Java harness passed, including new batch endpoint selection.
- Android16 native instrumentation: actual StaticLayout fit of3 short messages, emoji tail preservation, font scaling, tiny/overlong first message produces no readable IDs.
- Isolated Android16 launcher/API integration:4 unread messages ->2 fully displayed, button acknowledges exactly2 ->2 unread remain; next short message acknowledged ->456-character note remains unread, opens-full-text hint and no read button. No AndroidRuntime error observed during check.
- Android release compilation and lint passed. Harmony compilation/signature verification passed; no Harmony device connected, so real form-size callback/visual checks remain unverified on device.
- Final artifacts:Android10908,Harmony10915, display1.9.0, outside repository. Existing artifacts preserved. No commit/push/deploy performed. Both server and clients need updating for the batch endpoint.
