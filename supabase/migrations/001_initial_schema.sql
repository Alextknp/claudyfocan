-- Claudy Focan — Schema initial
-- Veille appels d'offres publics bâtiment

-- ============================================================
-- USERS (les 5 artisans)
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  metier TEXT NOT NULL,
  cpv_codes TEXT[] NOT NULL DEFAULT '{}',
  departements TEXT[] NOT NULL DEFAULT '{}',
  whatsapp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- APPELS D'OFFRES (source BOAMP)
-- ============================================================
CREATE TABLE appels_offres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boamp_id TEXT UNIQUE NOT NULL,
  titre TEXT NOT NULL,
  objet TEXT,
  date_pub DATE NOT NULL,
  deadline TIMESTAMPTZ,
  plateforme TEXT,
  url_dce TEXT,
  cpv_codes TEXT[] NOT NULL DEFAULT '{}',
  departement TEXT,
  statut TEXT NOT NULL DEFAULT 'ouvert'
    CHECK (statut IN ('ouvert', 'clos', 'attribue', 'annule')),
  resume_llm TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ao_date_pub ON appels_offres(date_pub DESC);
CREATE INDEX idx_ao_cpv ON appels_offres USING GIN(cpv_codes);
CREATE INDEX idx_ao_statut ON appels_offres(statut);
CREATE INDEX idx_ao_departement ON appels_offres(departement);

-- ============================================================
-- DCE FILES (documents téléchargés)
-- ============================================================
CREATE TABLE dce_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ao_id UUID NOT NULL REFERENCES appels_offres(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('CCTP', 'DPGF', 'RC', 'PLAN', 'AUTRE')),
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  parsed BOOLEAN NOT NULL DEFAULT false,
  parse_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dce_ao ON dce_files(ao_id);

-- ============================================================
-- ATTRIBUTIONS (avis d'attribution)
-- ============================================================
CREATE TABLE attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ao_id UUID NOT NULL REFERENCES appels_offres(id) ON DELETE CASCADE,
  laureat TEXT NOT NULL,
  montant NUMERIC,
  nb_offres INTEGER,
  prix_min NUMERIC,
  prix_max NUMERIC,
  date_attribution DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attr_ao ON attributions(ao_id);

-- ============================================================
-- USER RESPONSES (suivi réponses aux AO)
-- ============================================================
CREATE TABLE user_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ao_id UUID NOT NULL REFERENCES appels_offres(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'interessé'
    CHECK (statut IN ('interessé', 'en_cours', 'soumis', 'gagné', 'perdu', 'abandonné')),
  montant_propose NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ao_id)
);

-- ============================================================
-- PRIX UNITAIRES (Phase 4 — bibliothèque chiffrage)
-- ============================================================
CREATE TABLE prix_unitaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poste TEXT NOT NULL,
  unite TEXT NOT NULL,
  prix_ht NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pu_user ON prix_unitaires(user_id);

-- ============================================================
-- AGENT TASKS (bot Claudy)
-- ============================================================
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  logs JSONB NOT NULL DEFAULT '[]',
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
