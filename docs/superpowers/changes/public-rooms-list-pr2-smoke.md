# Public Rooms List — PR 2 Smoke Test

> **Scope**: Client + i18n only. Server already exposes
> `GET /api/rooms?visibility=public` (PR 1, deployed to production).
> The client now has the list UI, filters, polling, and the host-side
> visibility toggle in the lobby.
>
> **No client test runner** is configured in this repo. This document
> is the manual verification script — it walks through every behavior
> the spec demands and tells the tester what to expect at each step.

---

## 0. Pre-flight

1. Confirm server tests + build are still green:
   ```bash
   pnpm --filter @impostor/server test    # → 154/154 passing
   pnpm --filter @impostor/server build   # → no TS errors
   pnpm --filter @impostor/client build   # → DeepStringify passes for all 6 langs
   ```
2. Pick a target URL:
   - **Local dev** (recommended): `pnpm dev` (or build + serve the
     client, run the server on `:3001`).
   - **Production**: `https://impostor.nekix.lol` (only after PR 2
     is deployed — orchestrator will deploy).

---

## 1. Two public rooms show up in the list

**Goal**: Verify the list renders both rooms, with the right metadata.

1. Open Tab A and Tab B in the same browser (private windows or two
   browsers — same shared-rooms server).
2. In Tab A: enter a name, switch to "Create", **tick "Pública"**,
   click Crear.
3. In Tab B: do the same with a different name and different code.
4. On the entry page, scroll to the **"Salas públicas"** section.
5. **Expected**:
   - Both rooms appear as cards within ~5 seconds (first poll + render).
   - Each card shows: 5-char code, host first name only (no last name),
     locale short code (ES/EN/…), category or "Aleatoria", `n/max` players,
     age in seconds (`12s`, `1m 30s`, …).
   - No leak of `discussionTime`, `votingTimer`, or `hardcore`.

---

## 2. 5-second auto-refresh

**Goal**: Polling keeps the list fresh.

1. With both rooms visible, **wait 5 seconds without doing anything**.
2. **Expected**: a new `GET /api/rooms?visibility=public` hits the server
   (visible in the network tab). The list re-renders (cards stay in the
   same place because no data changed).
3. In Tab A, click **"Iniciar partida"** (need 3 players — so add a
   spectator or use another tab). Or simpler: open Tab C, join the room
   from Tab A using the code via the "Join" mode. Player count goes up.
4. **Within 5s** Tab B's public-rooms list reflects the new player count.

---

## 3. Manual refresh button

**Goal**: Debounced manual refresh works.

1. Click the **"Actualizar"** button on the public-rooms section.
2. **Expected**: a `GET /api/rooms` request fires immediately.
3. Click it again 5 times in quick succession.
4. **Expected**: only the first click fires a request; the rest are
   swallowed by the 1.5s debounce. After 1.5s the next click works.

---

## 4. Visibility toggle (host in lobby)

**Goal**: Toggling private in the lobby removes the room from the list
on the next poll.

1. In Tab A's lobby, scroll to the settings panel, find the new
   **"Visibilidad"** row (under Hardcore). It defaults to "Privada".
2. Click **"Pública"**.
3. **Expected**: a `UPDATE_SETTINGS` WS message goes out. The room stays
   public in the list (it was already public). The age counter keeps
   incrementing.
4. Click **"Privada"**.
5. **Within 5s** (next poll) the room disappears from Tab B's public
   list. Tab B's UI no longer offers a Join button for it.

---

## 5. Join a public room

**Goal**: The card's Join button lands the user in the lobby.

1. In Tab A's lobby, set it back to **"Pública"** (or use the other
   public room from step 1).
2. In Tab C (fresh, no name yet), type a name on the entry page.
3. Scroll to the public-rooms section. Find the room. Click
   **"Unirse"**.
4. **Expected**: Tab C is taken straight into that room's lobby. The
   player's name appears in the player list. The room card disappears
   from the public list (or its player count updates).

---

## 6. Language filter

**Goal**: `lang` filter narrows the list client-side.

1. With 2+ public rooms across at least 2 different `hostLocale`s
   (e.g., one ES, one EN), open the public-rooms section.
2. Open the **"Idioma"** dropdown, pick **"Español"**.
3. **Expected**: only the ES room stays visible. The EN room is
   filtered out instantly (no network call — pure client-side filter).
4. Switch back to **"All"**. Both rooms reappear.

---

## 7. "With space only" filter

**Goal**: `hasSpace` filter hides full rooms.

1. Have one room at full capacity (host + 9 others, or the max you set)
   and one room with free slots.
2. Tick **"Solo con espacio"**.
3. **Expected**: the full room disappears, the one with free slots stays.
4. Untick. Both rooms return.

---

## 8. Combine filters

**Goal**: Filters compose.

1. With rooms across multiple languages and capacities, set
   `lang = Español` AND `hasSpace = true`.
2. **Expected**: only rooms matching BOTH conditions are visible.

---

## 9. Empty state

**Goal**: When no public rooms exist, show the empty message.

1. Close all the public rooms you created (or have every host toggle
   to Private in their lobby).
2. Wait 5s for the next poll.
3. **Expected**: the list shows **"No hay salas públicas abiertas
   ahora mismo"** (or the English/PT/FR/IT/DE equivalent if the page
   language is set to one of those).

---

## 10. 51 rooms overflow

**Goal**: The "X of Y" indicator surfaces when the cap is hit.

> **Note**: with the current server behavior (PR 1), `hasMore` is always
> `false` in the response — the server currently does not flag the cap.
> See `openspec/changes/public-rooms-list/specs/public-rooms-discovery/spec.md`
> §"Max 50 Cap with Overflow Hint" for the contract. The client
> renders the cap-reached indicator whenever the server-reported
> `totalCount` exceeds the rendered `rooms.length`. To actually
> trigger this you'll need to either (a) wait for a follow-up server
> fix that propagates `hasMore` correctly, or (b) test it against a
> staging build that returns `hasMore: true` and `totalCount: 60`.

The fastest way to verify the rendering path is correct (without
changing the server):

1. In the browser devtools, override the network response for
   `/api/rooms?visibility=public` to return:
   ```json
   {
     "rooms": [/* 10 rooms, same shape */],
     "hasMore": true,
     "totalCount": 60
   }
   ```
2. **Expected**: under the rendered list you see
   **"Mostrando 10 de 60 salas"** (or the active locale's equivalent).

Without that override, the indicator is dormant but the i18n key is
present and the component branch is covered.

---

## 11. Language switching

**Goal**: All 6 locales render the new strings correctly.

1. In the top-right language selector, cycle through EN → ES → PT →
   FR → IT → DE.
2. **Expected** at each step:
   - The "Salas públicas" / "Public rooms" / etc. title renders.
   - The "Unirse" / "Join" / etc. button label is correct.
   - The "Idioma" / "Language" filter label updates.
   - The "Solo con espacio" / "With space only" filter label updates.
   - No English text leaks in non-EN locales, no voseo in ES.

---

## 12. Lobby visibility persistence

**Goal**: The visibility choice survives round/match transitions.

1. Create a public room, start a match, finish a round, return to lobby.
2. **Expected**: the radio still shows "Pública" (the setting was
   persisted server-side, not just local state).
3. Open the same room in Tab D, confirm Tab D sees visibility=public
   in the room state (visible in the player list area: nothing changes
   visually, but the room IS in `GET /api/rooms`).

---

## Cleanup

- Close all browser tabs.
- Stop the dev server.

If any step fails, capture:
- Browser console errors
- Network tab for `/api/rooms` and the WS frames
- The exact step number that broke

…and report back to the orchestrator.
