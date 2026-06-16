# Voting System Specification

## Purpose

Vote submission, tally, skip option, expulsion, and role reveal after expulsion.

## Requirements

### Requirement: Vote Submission and Tally

Every non-expelled player SHALL submit one vote targeting another player or skip. The system SHALL tally votes when all votes are cast.

#### Scenario: Happy path — majority expulsion

- GIVEN 5 active players in `VOTING` state
- WHEN 3 players vote for `Bob` and 2 skip
- THEN `Bob` is expelled and state transitions to `EVALUATION`

#### Scenario: Edge — tie or insufficient votes

- GIVEN 4 active players in `VOTING` state
- WHEN votes are 2 for `Alice` and 2 for `Bob`
- THEN no one is expelled and state returns to `DISCUSSION`
- AND the skip counter SHALL NOT increment

#### Scenario: Edge — all votes are skip

- GIVEN 5 active players
- WHEN all 5 vote to skip
- THEN no one is expelled and state returns to `DISCUSSION`

### Requirement: Role Reveal After Expulsion

When a player is expelled, the system SHALL reveal that player's role to all players.

#### Scenario: Happy path — impostor revealed

- GIVEN a game where expelled `Bob` is an impostor
- WHEN the expulsion result is broadcast
- THEN all players see "Bob was an impostor"

#### Scenario: Edge — non-impostor revealed

- GIVEN expelled `Carol` is a non-impostor
- WHEN the expulsion result is broadcast
- THEN all players see "Carol was NOT an impostor"
