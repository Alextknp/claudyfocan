-- Migration 003: Ajout colonne lots (JSONB array)
-- Format: [{"num": "LOT-0001", "nom": "...", "montant": 340000}, ...]

ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS lots JSONB DEFAULT '[]';
