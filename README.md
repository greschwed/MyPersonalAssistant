# Personal OS

AI-native personal dashboard. Stack: **Next.js 16 + Firebase (Firestore + Auth) + Anthropic Claude + OpenAI**.
Captura por voz via Telegram → classifica via LLM → roteia para a coleção certa → embedding para busca semântica.

Baseado no _Personal OS Build Cheat Sheet_ (Miles Deutscher / AI Edge), com Firestore no lugar de Supabase.

## Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, tokens oklch
- **Backend:** Firebase Admin SDK em route handlers
- **DB:** Firestore (NoSQL)
- **Vector:** Firestore Vector Search (`text-embedding-3-small`, 1536 dims)
- **Auth:** Firebase Auth (Google) + session cookie HTTP-only
- **LLM:** Claude (primary), OpenAI (Whisper + embeddings + fallback)
- **Captura:** Telegram bot + formulário web fallback
- **Hosting:** Vercel + cron diário

## Setup

```bash
npm install
cp .env.example .env.local   # preencher
npm run dev                  # http://localhost:3000
```

Variáveis em `.env.example`. Secrets reais ficam fora do OneDrive em `C:\Users\grego\.personal-os-secrets\`.

## Estrutura

```
src/
├── app/
│   ├── api/auth/session/   # criar/destruir session cookie
│   ├── login/              # tela de login Google
│   ├── globals.css         # tokens oklch + glass
│   ├── layout.tsx
│   └── page.tsx            # home dashboard
├── components/dashboard/
│   ├── Panel.tsx
│   ├── TopRail.tsx
│   └── cards.tsx           # Operator, Session, Habits, Calendar, etc.
├── lib/
│   ├── firebase/
│   │   ├── client.ts       # SDK client (browser)
│   │   ├── admin.ts        # SDK admin (server only)
│   │   ├── auth.ts         # signIn/Out helpers (client)
│   │   └── session.ts      # cookie de sessão (server)
│   └── userConfig.ts       # USER_ID, TZ, localDateKey()
└── proxy.ts                # Next.js 16 (era middleware.ts)
firestore.rules
firestore.indexes.json
firebase.json
```

## Comandos

| | |
|---|---|
| `npm run dev` | Servidor de dev |
| `npm run build` | Build de produção |
| `npm run start` | Servir build |
| `npx tsc --noEmit` | Type-check |

## Roadmap

Ver `PLAN.md` (não versionado). Status: Fase 1 (foundation) ✅. Próximo: Fase 2 (cards completos) ou Fase 3 (pipeline Telegram).
