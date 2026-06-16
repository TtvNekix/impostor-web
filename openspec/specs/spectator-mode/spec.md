# Spectator Mode Specification

## Purpose

Expelled player lifecycle: spectator status assignment, spectator UI, and rejoin on next match.

## Requirements

### Requirement: Expelled Player → Spectator

An expelled player SHALL immediately become a spectator. Spectators SHALL remain in the room and observe the match until it ends.

#### Scenario: Happy path — expelled player becomes spectator

- GIVEN a match in progress with 5 players
- WHEN `Bob` is expelled via vote
- THEN `Bob`'s status changes to `SPECTATOR`
- AND `Bob` sees a spectator view with the word and alive players

#### Scenario: Edge — spectator tries to vote

- GIVEN `Bob` is a spectator
- WHEN `Bob` submits a vote
- THEN the system SHALL reject the vote silently

### Requirement: Spectator Rejoin

When a new match begins in the same room, all spectators SHALL return to active player status.

#### Scenario: Happy path — spectator becomes active again

- GIVEN `Bob` is a spectator in a room where the match just ended
- WHEN the host starts a new match
- THEN `Bob`'s status reverts to `ACTIVE`
- AND `Bob` receives a new word or impostor role

#### Scenario: Edge — spectator leaves mid-match

- GIVEN `Bob` is a spectator
- WHEN `Bob` disconnects during the match
- THEN `Bob` MAY rejoin as spectator within the reconnection window
