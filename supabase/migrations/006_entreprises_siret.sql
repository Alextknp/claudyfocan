-- Migration 006: Table de mapping entreprise → SIRET
-- Consolidée depuis BOAMP + DECP pour dédupliquer les entreprises

CREATE TABLE IF NOT EXISTS entreprises_siret (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_normalise TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  siret TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'boamp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ent_siret ON entreprises_siret(siret);
CREATE INDEX IF NOT EXISTS idx_ent_nom ON entreprises_siret(nom_normalise);
