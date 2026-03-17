-- Migration 005: Ajouter le nom du titulaire résolu via API Sirene
ALTER TABLE decp_marches ADD COLUMN IF NOT EXISTS titulaire_nom TEXT;
