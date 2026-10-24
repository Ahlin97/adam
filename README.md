# Gymlogg

En webbapp (installerbar PWA) för styrketräning på gym. Välj övningar, bygg pass och veckoscheman, logga reps och vikt för varje set med ett tryck. Appen säger till när det är dags att höja vikten.

- **React + TypeScript + Tailwind**, byggd med Vite. Mobil först, mörkt tema och svenska överallt.
- **Supabase** för inloggning och databas. **IndexedDB** (Dexie) är en lokal cache som appen alltid läser och skriver mot först, så den fungerar utan nät och synkar när nätet är tillbaka.
- **Progressionsmotorn** (`src/engine`) är en ren TypeScript-modul utan beroenden, med enhetstester.
- **Apple Watch** via en Supabase Edge Function och en Genväg. Se [docs/APPLE_WATCH.md](docs/APPLE_WATCH.md).

Hela kravspecifikationen finns i [docs/SPEC.md](docs/SPEC.md).

---

## Kom igång lokalt

Krav: Node 20 eller senare.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # enhetstester (progressionsmotorn m.m.)
npm run build      # produktionsbygge i dist/
```

Utan `.env` körs appen i **lokalt läge**: inget konto, all data ligger bara i webbläsaren. Det räcker för att prova appen.

## Koppla på Supabase

1. Skapa ett gratis projekt på [supabase.com](https://supabase.com).
2. Skapa tabellerna. Antingen:
   - öppna **SQL Editor** i Supabase och kör innehållet i `supabase/migrations/20261024000000_init.sql`, eller
   - använd CLI:t: `npx supabase login`, `npx supabase link --project-ref <ref>` och `npx supabase db push`.
3. Under **Authentication → Providers → Email**: låt e-post/lösenord vara på. Vill du slippa bekräftelsemejlet för ditt eget konto stänger du av *Confirm email*.
4. Kopiera `.env.example` till `.env` och fyll i värdena från **Project Settings → API**:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```
5. Starta om `npm run dev`, skapa ett konto i appen och logga in.

Varje tabell skyddas med Row Level Security, så du ser bara dina egna rader.

## Publicera och installera på iPhone

Appen är statiska filer (`dist/`) och kan hostas gratis på t.ex. Netlify, Vercel eller Cloudflare Pages:

- Byggkommando: `npm run build`, publiceringsmapp: `dist`.
- Lägg in `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` som miljövariabler hos hosten.
- Alla sökvägar ska falla tillbaka på `index.html` (SPA). På Netlify sköts det av `public/_redirects`. På Vercel och Cloudflare Pages fungerar det automatiskt.
- I Supabase, under **Authentication → URL Configuration**: sätt *Site URL* till din publicerade adress.

Installera på iPhone: öppna adressen i **Safari** → **Dela** → **Lägg till på hemskärmen**. Appen startar då i helskärm, utan Safaris adressfält, och fungerar offline.

## Offline och synk

- Allt du gör sparas direkt i IndexedDB på telefonen, även **varje bekräftat set**. Ett pågående pass överlever att appen stängs, att telefonen startas om och att nätet försvinner.
- Ändringar som inte har synkats markeras lokalt och skickas till Supabase så fort nätet är tillbaka. Det sker automatiskt när appen kommer i förgrunden, vid `online` och var 20:e sekund medan appen är öppen.
- Hämtning sker inkrementellt: servern numrerar varje ändring och klienten hämtar bara det som är nytt. Set som du loggat från klockan dyker därför upp i webbappen inom några sekunder.
- Konflikter: en lokal ändring som inte hunnit synkas vinner över serverns version. I övrigt gäller serverns version.
- Service workern (vite-plugin-pwa) cachar själva appen, så den startar utan nät. Inloggningen sparas lokalt, så du är fortfarande inloggad offline.
- Appen ber webbläsaren om beständig lagring (`navigator.storage.persist()`) så att data inte rensas.

## Under passet

- Skärmen hålls tänd med Screen Wake Lock API (Safari 16.4 eller senare).
- Vilotimern räknar mot en sluttid, så den går rätt även om skärmen släcks. När vilan är slut blinkar skärmen, ett pip spelas upp och telefonen vibrerar där det stöds. iPhone saknar vibrations-API i webbläsaren, så där blir signalen ljud och blink. Ligger appen i bakgrunden visas en notis om du har gett tillåtelse. Notiser kräver att appen är installerad på hemskärmen (iOS 16.4 eller senare).
- Påminnelser på träningsdagar: under **Mer → Påminnelser** laddar du ner en kalenderfil (.ics) med återkommande händelser för ditt programs träningsdagar. En webbapp kan inte schemalägga notiser utan en push-server, så det är kalendern som påminner dig.

## Apple Watch

Edge Functionen `watch` returnerar nästa set i dagens pass och tar emot reps och vikt. Du autentiserar med en personlig API-nyckel som du skapar under **Mer → Apple Watch**. Hur du driftsätter funktionen och bygger Genvägen steg för steg står i **[docs/APPLE_WATCH.md](docs/APPLE_WATCH.md)**.

## Projektstruktur

```
src/
  engine/        Progressionsmotor, avrundning, skivkalkylator, 1RM, schema (ren TS + tester)
  db/            Dexie-databas, repo-funktioner och live-hooks
  sync/          Inloggning och synk mot Supabase
  data/          Övningsbibliotek och startprogram
  features/      Sidor: home, library, templates, programs, workout, history, stats, settings, watch
  ui/            Gemensamma UI-komponenter
supabase/
  migrations/    Databasschema
  functions/     Edge Function för klockan (+ _shared/engine, kopia av src/engine)
```

`supabase/functions/_shared/engine` genereras från `src/engine` med `npm run engine:sync`. Kör kommandot efter ändringar i motorn. Ett test larmar om kopian är inaktuell.

## Arkitekturval

- **Lokal först:** appen läser och skriver alltid mot IndexedDB och synkar i bakgrunden. Det gör passloggningen snabb och oberoende av nätet.
- **Ett generiskt tabellformat** (`user_id, id, data jsonb, deleted, seq`) för alla samlingar. Det håller synken enkel och gör att samma domänobjekt används i webbappen, motorn och Edge Functionen.
- **Övningsbiblioteket** läggs in per användare med fasta id:n (`bi-…`), så att favoriter, egna viktsteg och anteckningar fungerar likadant för inbyggda och egna övningar.
- **Progressionsstatus** härleds från historiken i stället för att lagras.
- **Vikter lagras alltid i kg.** lb är bara visning.

## Faser

1. ✅ Datamodell, övningsbibliotek med startdata, passmallar och program
2. ✅ Logga pass med vilotimer, samt historik
3. ✅ Progressionsmotorn med tester och förslag i loggvyn
4. ✅ Statistik och grafer, export och import
5. ✅ API för klockan och offlinestöd
