# Public Rooms Discovery Specification

## Purpose

Discovery path for unauthenticated visitors landing on the entry page: a read-only, HTTP-polled browser of currently-open public rooms, with host opt-in visibility and a host in-lobby toggle.

## Requirements

### Requirement: Public Rooms HTTP Endpoint

The system MUST expose `GET /api/rooms` returning a list of public rooms. The endpoint MUST accept query parameters `visibility` (only `public` is honored), `lang` (one of the 6 supported locale codes), and `hasSpace` (boolean). The response MUST include `Cache-Control: max-age=3`.

#### Scenario: Happy path — endpoint returns the list

- GIVEN 3 public rooms and 1 private room exist
- WHEN a client requests `GET /api/rooms?visibility=public`
- THEN the response body contains exactly 3 rooms
- AND the private room is NOT present
- AND `Cache-Control: max-age=3` is set

#### Scenario: Edge — zero public rooms

- GIVEN no public rooms exist
- WHEN a client requests `GET /api/rooms?visibility=public`
- THEN the response body is an empty list with a success status

### Requirement: Public Room DTO with Privacy Guarantees

Each entry MUST be a `PublicRoomDTO` containing exactly: `roomCode`, `hostFirstName`, `category`, `hostLocale`, `playerCount`, `maxPlayers`, `ageSeconds`. The system MUST expose only the host's first whitespace-delimited name token and the room's `category`. The system MUST NOT expose full host name, last name, `discussionTime`, `votingTimer`, `hardcore`, or any other setting. A recognizable host is the point of discovery; private friend-group configuration MUST stay private.

#### Scenario: Happy path — DTO contains the agreed fields only

- GIVEN a public room with host `Alice Smith`, category `Animals`, locale `es`, 4 of 10 players, created 120s ago
- WHEN the room is serialized
- THEN the DTO contains `roomCode`, `hostFirstName`=`Alice`, `category`=`Animals`, `hostLocale`=`es`, `playerCount`=4, `maxPlayers`=10, `ageSeconds`=120
- AND the DTO does NOT contain `hostLastName`, `discussionTime`, `votingTimer`, or `hardcore`

### Requirement: Empty Room Filtering

The system MUST exclude from `getAllPublicRooms` any room with zero ACTIVE players. This is defense in depth: `RoomStore.deleteRoom` already destroys empty rooms after host disconnect, but a race window exists before cleanup runs.

#### Scenario: Happy path — empty room is hidden

- GIVEN a public room whose host just disconnected and no players remain
- WHEN a client requests `GET /api/rooms?visibility=public`
- THEN that room is NOT in the response

### Requirement: Max 50 Cap with Overflow Hint

The system MUST return at most 50 entries. When more than 50 public rooms are eligible, the response MUST include `hasMore: true` and `totalCount: <N>`. The client SHALL display a localized `"{N} more rooms exist — refine your filter"` hint whenever `hasMore` is true.

#### Scenario: Edge — 60 rooms, hint shown

- GIVEN 60 public rooms exist
- WHEN a client requests `GET /api/rooms?visibility=public`
- THEN the response contains 50 entries
- AND `hasMore` is `true`
- AND `totalCount` is `60`
- AND the client displays the localized overflow hint

### Requirement: Client Refresh Behavior

The client MUST poll `GET /api/rooms` every 5 seconds while the public rooms list tab is visible. The client MUST stop polling on tab close, route change, or component unmount. The client MUST provide a manual refresh button that triggers an immediate fetch on click.

#### Scenario: Happy path — polling runs while the tab is open

- GIVEN the public rooms list tab is open
- WHEN 5 seconds elapse
- THEN the client sends a `GET /api/rooms` request

#### Scenario: Edge — polling stops on tab close

- GIVEN the public rooms list tab is open and the client is polling
- WHEN the user navigates away from the list
- THEN polling stops
- AND no further `GET /api/rooms` requests are issued until the tab reopens

### Requirement: List Filter Scope

The public rooms list client filter MUST support exactly two filters: `lang` (locale code) and `hasSpace` (boolean). The client MUST NOT expose a category filter, a player-count range filter, or any other filter. Filters are applied client-side.

#### Scenario: Happy path — filters narrow the list

- GIVEN the server returns 30 public rooms across 4 locales
- WHEN the user selects `lang = es` and `hasSpace = true`
- THEN the client shows only rooms with `hostLocale = "es"` AND `playerCount < maxPlayers`

### Requirement: i18n Coverage

All 6 i18n dictionaries (en, es, pt, fr, it, de) MUST define the public-rooms UI keys: tab title, list empty state, refresh button label, overflow hint template, error message, and the "Make public" toggle label. The Spanish (es) dictionary MUST use castellano forms (no voseo) and vosotros imperatives. The DeepStringify build-time type check MUST pass for all 6 dictionaries.

## Out of Scope

- Chat or direct messages within a public room
- Room passwords or invite tokens
- Deep links of the form `/room/ABC123`
- Custom skins or themes
- Persistent sessions across reloads
- Room history or post-match archives
- "Report room" moderation flow
- Friend lists or social graph
- Host-blocked-user lists
- Public room creation rate-limit (debounce UI only)
