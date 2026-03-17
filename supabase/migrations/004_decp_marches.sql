-- Migration 004: Table DECP (Données Essentielles de la Commande Publique)
-- Montants réels + SIRET titulaires

CREATE TABLE IF NOT EXISTS decp_marches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decp_id TEXT UNIQUE NOT NULL,
  objet TEXT,
  montant NUMERIC,
  cpv_code TEXT,
  acheteur_siret TEXT,
  acheteur_nom TEXT,
  titulaire_siret TEXT,
  lieu_code TEXT,
  lieu_nom TEXT,
  date_notification DATE,
  date_publication DATE,
  nature TEXT,
  procedure_type TEXT,
  duree_mois INTEGER,
  nb_offres INTEGER,
  forme_prix TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decp_titulaire ON decp_marches(titulaire_siret);
CREATE INDEX IF NOT EXISTS idx_decp_lieu ON decp_marches(lieu_code);
CREATE INDEX IF NOT EXISTS idx_decp_date ON decp_marches(date_notification DESC);
