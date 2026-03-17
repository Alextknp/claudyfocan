-- Migration 002: Enrichissement appels_offres
-- Champs extraits du raw_json BOAMP (donnees, nomacheteur, etc.)

ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS acheteur TEXT,
  ADD COLUMN IF NOT EXISTS montant_estime NUMERIC,
  ADD COLUMN IF NOT EXISTS description_detail TEXT,
  ADD COLUMN IF NOT EXISTS type_procedure TEXT,
  ADD COLUMN IF NOT EXISTS type_marche TEXT,
  ADD COLUMN IF NOT EXISTS descripteur_libelle TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS url_dce_telechargement TEXT;

CREATE INDEX IF NOT EXISTS idx_ao_acheteur ON appels_offres(acheteur);
CREATE INDEX IF NOT EXISTS idx_ao_type_marche ON appels_offres(type_marche);
