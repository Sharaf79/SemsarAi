-- Unique index on (negotiation_id, client_id) for optimistic-send dedupe.
-- MySQL treats multiple NULL client_id values as distinct, so this allows
-- many rows with NULL client_id while preventing duplicate non-null clientIds
-- within the same negotiation.
CREATE UNIQUE INDEX `negotiation_messages_negotiationId_clientId_key`
  ON `negotiation_messages`(`negotiation_id`, `client_id`);
