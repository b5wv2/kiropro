-- Migration 033: Add card_hash for zero-duplicate inventory detection without exposing plain numbers
ALTER TABLE kiropro_cards_inventory 
ADD COLUMN IF NOT EXISTS card_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kiropro_cards_card_hash 
ON kiropro_cards_inventory (card_hash) 
WHERE card_hash IS NOT NULL;
