# Word Assignment Specification

## Purpose

Word bank management, secret word delivery per player, and impostor role string assignment.

## Requirements

### Requirement: Word Selection and Assignment

The system SHALL select a word from a configured bank and assign it to all non-impostor players. Impostors SHALL receive the string "Eres el impostor".

#### Scenario: Happy path — non-impostor receives the word

- GIVEN a game starts with 5 players and 1 impostor
- WHEN the round begins
- THEN 4 non-impostor players see the secret word on screen
- AND the impostor sees "Eres el impostor"

#### Scenario: Edge — multiple impostors

- GIVEN a game starts with 8 players and 2 impostors
- WHEN the round begins
- THEN both impostors see "Eres el impostor"
- AND 6 non-impostors see the same secret word

### Requirement: Impostor Count Validation

The host SHALL configure the impostor count within these bounds: 1 impostor for 3-6 players; 1-2 for 7-10 players.

#### Scenario: Happy path — valid impostor count

- GIVEN a room has 5 players
- WHEN the host sets impostors to 1
- THEN the configuration is accepted

#### Scenario: Edge — impostor count exceeds limit

- GIVEN a room has 5 players
- WHEN the host sets impostors to 2
- THEN the system SHALL reject with "max 1 impostor for 3-6 players"

#### Scenario: Edge — no words in bank

- GIVEN the word bank is empty
- WHEN the host tries to start a game
- THEN the system SHALL reject with "no words available"
