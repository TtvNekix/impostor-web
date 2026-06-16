# Room Management Specification

> **Source of truth** — this spec is the canonical definition of room-management behavior.
> Extended by the `public-rooms-list` change on 2026-06-16 (server-side `RoomSettings.visibility` and `hostLocale` fields, plus `RoomManager` settings sanitization on both HTTP and WebSocket paths).

## Purpose

Room lifecycle: creation, joining, departure, host assignment, and player limits.

## Requirements

### Requirement: Room Creation

The system MUST allow any unauthenticated user to create a room by providing a unique room code and a username.

#### Scenario: Happy path — room created with creator as host

- GIVEN a user provides a unique room code `ABC123` and username `Alice`
- WHEN the system processes the room creation request
- THEN a room `ABC123` is created with capacity 10
- AND `Alice` is added as the first player and assigned as host

#### Scenario: Edge — duplicate room code

- GIVEN a room `ABC123` already exists
- WHEN a user attempts to create a room with code `ABC123`
- THEN the system SHALL reject the request with a "room code already taken" error

### Requirement: Player Join

A player MUST provide a valid room code and username to join. The username SHALL be unique within the room.

#### Scenario: Happy path — player joins room

- GIVEN a room `ABC123` exists with 2 players and host `Alice`
- WHEN a new player `Bob` joins via code `ABC123`
- THEN `Bob` is added to the player list with capacity 3/10

#### Scenario: Edge — room is full

- GIVEN room `ABC123` has 10 players
- WHEN an 11th player attempts to join
- THEN the system SHALL reject with "room is full" error

#### Scenario: Edge — duplicate username in room

- GIVEN room `ABC123` has a player named `Alice`
- WHEN user attempts to join with username `Alice`
- THEN the system SHALL reject with "username already taken" error

### Requirement: Host Reassignment on Departure

When the host leaves, the system SHALL assign host to the player who has been in the room longest.

#### Scenario: Happy path — host leaves, next longest gets host

- GIVEN room has players `Alice` (host), `Bob` (joined 2min ago), `Carol` (joined 5min ago)
- WHEN `Alice` leaves
- THEN `Carol` (longest in room) becomes the new host

#### Scenario: Edge — last player leaves

- GIVEN room has 1 player (Alice, host)
- WHEN Alice leaves
- THEN the room SHALL be destroyed

### Requirement: Room Visibility Setting

`RoomSettings` MUST include a `visibility` field with the type `'public' | 'private'`. The default value MUST be `'private'` whenever `visibility` is not explicitly provided. The field MUST be settable both at room creation time and via the in-lobby `UPDATE_SETTINGS` message. The system MUST reject any value of `visibility` that is not in `{'public', 'private'}` with a validation error. This exists so that hosts can opt in to discovery for casual public play while keeping today's friend-group flow as the default.

#### Scenario: Happy path — host creates a public room

- GIVEN a host submits room creation with `visibility: 'public'`
- WHEN the room is created
- THEN the stored `RoomSettings.visibility` is `'public'`
- AND the room is eligible to appear in `GET /api/rooms?visibility=public`

#### Scenario: Edge — host omits visibility, defaults to private

- GIVEN a host submits room creation with no `visibility` field
- WHEN the room is created
- THEN the stored `RoomSettings.visibility` is `'private'`
- AND the room is NOT eligible to appear in `GET /api/rooms?visibility=public`
- AND no existing private-room flow changes

#### Scenario: Edge — host toggles visibility from the lobby

- GIVEN a room exists with `visibility: 'private'` and the host is in the lobby
- WHEN the host sends `UPDATE_SETTINGS` with `visibility: 'public'`
- THEN the stored `RoomSettings.visibility` becomes `'public'`
- AND the room becomes eligible in the next `GET /api/rooms` poll cycle

### Requirement: Host Locale Setting

`RoomSettings` MUST include a `hostLocale` field of type `Locale` (one of the 6 supported codes: `en`, `es`, `pt`, `fr`, `it`, `de`). The system MUST validate that `hostLocale` is one of these 6 codes and MUST reject any other value with a validation error. This field exists so the public-rooms list can display the host's preferred language and so the client can route the new user into a room whose host speaks their language.

#### Scenario: Happy path — host sets a supported locale

- GIVEN a host submits room creation with `hostLocale: 'es'`
- WHEN the room is created
- THEN the stored `RoomSettings.hostLocale` is `'es'`
- AND the public-rooms DTO for this room reports `hostLocale: 'es'`

#### Scenario: Edge — host submits an unsupported locale

- GIVEN a host submits room creation with `hostLocale: 'jp'`
- WHEN the room is created
- THEN the system MUST reject the request with a validation error
- AND no room is created

### Requirement: Settings Sanitization on the Server

`RoomManager` MUST sanitize incoming settings on every create and update path. If `visibility` is missing, the system MUST treat it as `'private'`. If `hostLocale` is missing, the system MUST treat it as `'en'`. The system MUST reject settings whose `visibility` is not in `{'public', 'private'}` or whose `hostLocale` is not in the supported 6-code set. Sanitization MUST be applied on both the HTTP `POST /api/rooms` path and the `UPDATE_SETTINGS` WebSocket path, so that no client can bypass it by switching transports.

#### Scenario: Happy path — missing fields get defaults

- GIVEN a client submits `{ maxPlayers: 8 }` with no `visibility` and no `hostLocale`
- WHEN `RoomManager` sanitizes the settings
- THEN `visibility` becomes `'private'`
- AND `hostLocale` becomes `'en'`
- AND the room is created

#### Scenario: Edge — invalid visibility is rejected

- GIVEN a client submits `{ visibility: 'whisper' }`
- WHEN `RoomManager` sanitizes the settings
- THEN the request is rejected with a validation error
- AND no room is created or updated

#### Scenario: Edge — invalid hostLocale is rejected on UPDATE_SETTINGS

- GIVEN an existing room is in lobby state
- WHEN the host sends `UPDATE_SETTINGS` with `hostLocale: 'jp'`
- THEN the update is rejected
- AND the stored `hostLocale` is unchanged
