# Multi-Match Specification

## Purpose

Match reset, new word selection, room settings reuse, and state cleanup between matches.

## Requirements

### Requirement: Match End → New Match

When a match ends (GAME_OVER), the system SHALL return to LOBBY state and allow starting a new match without recreating the room.

#### Scenario: Happy path — new match after game over

- GIVEN a room in `GAME_OVER` state with all players present
- WHEN the host clicks "New Match"
- THEN state returns to `LOBBY`
- AND all players become `ACTIVE`
- AND a new word is selected from the bank

#### Scenario: Edge — player count changed between matches

- GIVEN a room had 5 players in the previous match
- WHEN between matches a player leaves (now 4 players)
- THEN the new match SHALL start with 4 players if host starts it

### Requirement: Room Settings Persistence

The room SHALL retain its configuration (max players, impostor count, timer duration) across matches until the host changes them.

#### Scenario: Happy path — settings persist

- GIVEN the host configured 8 max players and 90s timer
- WHEN match 1 ends and match 2 begins
- THEN match 2 uses 8 max players and 90s timer without reconfiguration

#### Scenario: Edge — host changes settings between matches

- GIVEN match 1 used 1 impostor and 60s timer
- WHEN the host changes impostor count to 2 and timer to 90s between matches
- THEN match 2 uses the new settings
