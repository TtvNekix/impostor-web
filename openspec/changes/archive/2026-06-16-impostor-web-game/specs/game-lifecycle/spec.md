# Game Lifecycle Specification

## Purpose

State machine governing match phases: lobby, discussion, voting, expulsion, and round end, plus win-condition evaluation.

## Requirements

### Requirement: Game State Machine

The game SHALL progress through these states: `LOBBY` → `DISCUSSION` → `VOTING` → `EVALUATION` → `LOBBY` (next match) or `GAME_OVER`.

#### Scenario: Happy path — full cycle from lobby to game over

- GIVEN a room in `LOBBY` with 5 players
- WHEN the host starts the game
- THEN state transitions to `DISCUSSION` and the discussion timer begins

#### Scenario: Edge — insufficient players

- GIVEN a room in `LOBBY` with 2 players
- WHEN the host tries to start
- THEN the system SHALL reject with "minimum 3 players required"

### Requirement: Phase Transitions on Timer

The system SHALL enforce timer-driven transitions from `DISCUSSION` to `VOTING` based on host-configured duration (60-120s).

#### Scenario: Happy path — discussion timer expires

- GIVEN room is in `DISCUSSION` state with a 60s timer
- WHEN 60 seconds elapse
- THEN state transitions to `VOTING` automatically

#### Scenario: Edge — timer at boundary values

- GIVEN the host configures a 45s timer
- WHEN the configuration is submitted
- THEN the system SHALL clamp to the minimum allowed (60s)

### Requirement: Win Condition Check

After each expulsion, the system SHALL evaluate win conditions server-side.

#### Scenario: Non-impostors win

- GIVEN a room with 1 impostor and 3 non-impostors
- WHEN the last impostor is expelled
- THEN non-impostors win and state becomes `GAME_OVER`

#### Scenario: Impostors win

- GIVEN a room with 2 impostors and 3 non-impostors
- WHEN a non-impostor is expelled (leaving 2 impostors, 2 non-impostors)
- THEN impostors win because non-impostors (2) ≤ impostors (2)
