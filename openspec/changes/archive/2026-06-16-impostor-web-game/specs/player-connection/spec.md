# Player Connection Specification

## Purpose

Socket.IO lifecycle for player connections, reconnection window, disconnect timeout, and stale player cleanup.

## Requirements

### Requirement: Socket.IO Connection Lifecycle

Every player SHALL connect via Socket.IO. The server SHALL track each connection by socket ID and map it to the player's room and user.

#### Scenario: Happy path — player connects successfully

- GIVEN a room `ABC123` exists
- WHEN `Alice` connects via Socket.IO with room code and username
- THEN the server maps Alice's socket ID to room `ABC123`
- AND Alice receives a `connected` acknowledgment

#### Scenario: Edge — reconnect with same username

- GIVEN `Alice` disconnects from room `ABC123`
- WHEN `Alice` reconnects within 30 seconds with the same username
- THEN the server updates the socket ID mapping
- AND Alice resumes her previous state (active or spectator)

### Requirement: Disconnect Timeout and Cleanup

If a player disconnects and does not reconnect within 30 seconds, the system SHALL mark them as disconnected and remove them from the active player list.

#### Scenario: Happy path — cleanup stale connection

- GIVEN `Alice` (active) disconnects from the game
- WHEN 30 seconds pass without reconnection
- THEN Alice is removed from the player list
- AND she does not participate in the current match

#### Scenario: Edge — disconnected player wins match

- GIVEN `Alice` is removed after 30s timeout
- WHEN the remaining players finish the match
- THEN Alice does not receive a win/loss outcome

#### Scenario: Edge — reconnection during voting

- GIVEN `Alice` (active) disconnects during `DISCUSSION`
- WHEN `Alice` reconnects within 10 seconds during `VOTING` phase
- THEN Alice can cast her vote if voting is still open
