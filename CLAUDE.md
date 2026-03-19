# CLAUDE.md — Claudy Focan

## Projet

Outil de veille et d'analyse d'appels d'offres publics bâtiment.
Usage privé pour ~5 amis artisans (menuiserie, cloisons, faux plafonds, géomètre, AMO).
Le bot s'appelle "Claudy" — répliques Dikkenek dans les logs.

## Commandes

```bash
npm run dev          # localhost:3002
npm run build        # Build production
npm run lint         # ESLint
```

## Stack

- **Next.js 16** (App Router, server components par défaut)
- **React 19**, **TypeScript 5.9** (strict)
- **Tailwind CSS 4** (syntaxe @theme)
- **Supabase** PostgreSQL (instance dédiée CF, pas celle de spoutnik)
- **Playwright** pour le scraping DCE (Phase 2)
- **Twilio** WhatsApp pour les alertes
- **Claude API** (Sonnet) pour l'analyse LLM (Phase 3)

## Structure

```
app/
  page.tsx               # Landing — grille des métiers
  appels/page.tsx        # Liste des AO (filtrage CPV via searchParams)
  api/
    boamp/fetch/route.ts # POST — fetch BOAMP API → upsert en base
    alerts/whatsapp/     # POST — alertes WhatsApp par profil
lib/
  supabase.ts            # getBrowserClient() / createServerClient()
  db-types.ts            # Types TS pour toutes les tables
  boamp.ts               # Client BOAMP API (fetch par date, par range)
  agents/
    base-agent.ts        # BaseAgent (même pattern que spoutnik)
supabase/
  migrations/            # SQL versionnés (001_initial_schema.sql)
scripts/                 # Scripts batch (import historique, etc.)
```

## Conventions de code

### Nommage
- Composants : PascalCase
- Fichiers : kebab-case
- Types DB : suffixe `Row` (AppelOffreRow, UserRow)

### Imports
- Alias absolu `@/` pour tous les imports
- `"use client"` uniquement quand nécessaire

### API Routes
- Fichier : `app/api/[feature]/[action]/route.ts`
- Export : `GET`, `POST` (named exports)
- Auth : header `x-api-secret` vérifié contre `ADMIN_SECRET`

### Agents (BaseAgent)
- Étendent `BaseAgent` (classe abstraite)
- Méthodes : `run()` (abstract), `log()`, `setProgress(0-100)`, `complete()`, `fail()`
- Logs persistés en JSONB dans Supabase

## Base de données

### Tables
- `users` : les 5 artisans (nom, métier, cpv_codes[], departements[], whatsapp)
- `appels_offres` : AO BOAMP (boamp_id unique, cpv_codes[], statut)
- `dce_files` : documents DCE téléchargés (Phase 2)
- `attributions` : avis d'attribution (Phase 3)
- `user_responses` : suivi réponses aux AO
- `prix_unitaires` : bibliothèque chiffrage (Phase 4)
- `agent_tasks` : suivi des jobs du bot Claudy

### Statuts AO
`ouvert → clos → attribue → annule`

## Env vars requises

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
CRON_SECRET=
```

## Validation

- `npx tsc --noEmit` pour valider le TypeScript
- Webpack watcher ignore `scripts/`, `.claude/`, `.git/`
