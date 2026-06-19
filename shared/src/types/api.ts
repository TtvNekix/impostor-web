/**
 * Wire-level types for the public-rooms HTTP API.
 *
 * These DTOs are the security boundary between the in-memory room state
 * and any unauthenticated external reader. The DTO surface is kept
 * deliberately small: only the fields a public visitor needs to decide
 * whether to join. No discussion timer, no hardcore flag, no full host
 * name (only the first whitespace-delimited token) — those stay private.
 */

export interface PublicRoomDTO {
  /** 5-character room code. */
  roomCode: string;
  /**
   * Host's first whitespace-delimited name token. "Alice Smith" -> "Alice".
   * Visible in the public rooms list so visitors can see who is hosting.
   * This is a deliberate product decision: in a social party game,
   * players want to know who is hosting before they join.
   */
  hostFirstName: string;
  /** Room category (kebab-case identifier) or null for random. */
  category: string | null;
  /** Host's preferred locale code (one of the 6 supported). */
  hostLocale: string;
  /** Count of players whose status is 'ACTIVE'. Empty rooms are excluded upstream. */
  playerCount: number;
  /** Max players allowed in the room. */
  maxPlayers: number;
  /** Seconds since the room was created (floor of ms/1000). */
  ageSeconds: number;
}

export interface PublicRoomsResponse {
  rooms: PublicRoomDTO[];
  /** True when more than `MAX_PUBLIC_ROOMS_RETURNED` rooms matched the filter. */
  hasMore: boolean;
  /** Total number of rooms matching the filter (before cap). */
  totalCount: number;
}
