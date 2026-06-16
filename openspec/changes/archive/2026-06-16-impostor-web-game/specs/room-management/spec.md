# Room Management Specification

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
