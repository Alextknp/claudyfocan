/** Users — les 5 artisans */
export interface UserRow {
  id: string;
  nom: string;
  metier: string;
  cpv_codes: string[];
  departements: string[];
  whatsapp: string;
  created_at: string;
  updated_at: string;
}

/** Appels d'offres (source BOAMP) */
export interface AppelOffreRow {
  id: string;
  boamp_id: string;
  titre: string;
  objet: string | null;
  date_pub: string;
  deadline: string | null;
  plateforme: string | null;
  url_dce: string | null;
  cpv_codes: string[];
  departement: string | null;
  statut: "ouvert" | "clos" | "attribue" | "annule";
  resume_llm: string | null;
  raw_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Fichiers DCE téléchargés */
export interface DceFileRow {
  id: string;
  ao_id: string;
  type: "CCTP" | "DPGF" | "RC" | "PLAN" | "AUTRE";
  filename: string;
  path: string;
  parsed: boolean;
  parse_result: Record<string, unknown> | null;
  created_at: string;
}

/** Avis d'attribution */
export interface AttributionRow {
  id: string;
  ao_id: string;
  laureat: string;
  montant: number | null;
  nb_offres: number | null;
  prix_min: number | null;
  prix_max: number | null;
  date_attribution: string;
  created_at: string;
}

/** Réponses utilisateurs aux AO */
export interface UserResponseRow {
  id: string;
  user_id: string;
  ao_id: string;
  statut: "interessé" | "en_cours" | "soumis" | "gagné" | "perdu" | "abandonné";
  montant_propose: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Bibliothèque de prix unitaires (Phase 4) */
export interface PrixUnitaireRow {
  id: string;
  user_id: string;
  poste: string;
  unite: string;
  prix_ht: number;
  created_at: string;
  updated_at: string;
}

/** Tâches agents (bot Claudy) */
export interface AgentTaskRow {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  logs: Array<{ timestamp: string; level: string; message: string }>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}
