# Delta for Room Management

## ADDED Requirements

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
