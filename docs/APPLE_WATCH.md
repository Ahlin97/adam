# Logga från Apple Watch med Genvägar

Gymlogg har ingen egen klockapp. I stället finns ett litet API (en Supabase Edge Function, `watch`)
som du anropar från appen **Genvägar** (Shortcuts) på iPhone. Genvägarna synkas till klockan och kan
köras från urtavlan, Smart Stack, Siri eller Åtgärdsknappen på Apple Watch Ultra.

Allt du loggar via klockan hamnar i samma databas som webbappen och syns där vid nästa synk.

- [1. Driftsätt funktionen](#1-driftsätt-funktionen)
- [2. Skapa en API-nyckel](#2-skapa-en-api-nyckel)
- [3. API:t i korthet](#3-apit-i-korthet)
- [4. Genväg "Nästa set"](#4-genväg-nästa-set)
- [5. Genväg "Logga set"](#5-genväg-logga-set)
- [6. Genväg "Logga som föreslaget" (ett tryck)](#6-genväg-logga-som-föreslaget-ett-tryck)
- [7. Genväg "Avsluta pass"](#7-genväg-avsluta-pass)
- [8. Få upp genvägarna på klockan](#8-få-upp-genvägarna-på-klockan)
- [9. Testa med curl](#9-testa-med-curl)
- [10. Felsökning](#10-felsökning)

---

## 1. Driftsätt funktionen

Kräver [Supabase CLI](https://supabase.com/docs/guides/cli) och att databasen redan är migrerad
(`supabase db push`).

```bash
# 1. Kopiera progressionsmotorn till supabase/functions/_shared/engine
npm run engine:sync

# 2. Logga in och länka projektet (en gång)
supabase login
supabase link --project-ref <ditt-projekt-ref>

# 3. Driftsätt – utan JWT-kontroll, funktionen kontrollerar API-nyckeln själv
supabase functions deploy watch --no-verify-jwt
```

`supabase/config.toml` innehåller redan `[functions.watch] verify_jwt = false`, men flaggan skadar inte.
`SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY` sätts automatiskt av Supabase – du behöver inga egna secrets.

Kör `npm run engine:sync` och driftsätt igen varje gång progressionsmotorn (`src/engine`) ändrats,
annars kan klockan och webbappen ge olika förslag.

Funktionens adress blir:

```
https://<ditt-projekt-ref>.supabase.co/functions/v1/watch
```

Lokalt kan du testa med `supabase start` och `supabase functions serve watch --no-verify-jwt`
(adressen blir då `http://127.0.0.1:54321/functions/v1/watch`).

## 2. Skapa en API-nyckel

1. Öppna Gymlogg → **Inställningar** → **Apple Watch** (du måste vara inloggad och online).
2. Tryck **Skapa API-nyckel**, ge den ett namn (t.ex. "Apple Watch") och tryck **Skapa nyckel**.
3. **Kopiera nyckeln direkt** – den visas bara en gång (bara en hash sparas i databasen).
   Den börjar med `gl_`. Kopiera också adressen (URL) som visas.
4. Tappar du bort nyckeln: återkalla den och skapa en ny. Under listan ser du när varje nyckel senast användes.

Tips: Klistra in nyckeln i Anteckningar på iPhone tillfälligt så är den lätt att klistra in i Genvägar.
Radera anteckningen efteråt – nyckeln ger full åtkomst till att logga i ditt konto.

## 3. API:t i korthet

Nyckeln skickas i headern `x-api-key: gl_…` (alternativt `Authorization: Bearer gl_…` eller `?key=gl_…`).
Alla svar är JSON och har alltid fältet **`text`** – en färdig svensk mening att visa eller läsa upp.
Fel svarar med HTTP 4xx/5xx och `{ "error": "…", "text": "…" }`.

| Anrop | Vad det gör |
| --- | --- |
| `GET /watch/next` | Nästa set i pågående pass. Finns inget pass sägs vad som står på tur idag. |
| `GET /watch/next?start=1` | Som ovan, men startar dagens pass från ditt aktiva program om inget pass pågår. |
| `POST /watch/start` | Startar dagens pass (samma som `next?start=1`). `?templateId=<id eller namn>` väljer en annan mall, t.ex. på en vilodag. `force=1` startar ett nytt pass fast dagens redan är klart. |
| `POST /watch/log` | Loggar nästa set. Brödtext (JSON): `{ "reps": 8, "weight": 82.5, "rpe": 8 }`. Allt är valfritt – det som saknas tas från förslaget. Svarar med nästa set. |
| `POST /watch/finish` | Avslutar pågående pass och svarar med en sammanfattning. |
| `GET /watch/today` | Kort översikt över dagens pass. |

Det går också att skriva `?action=next|start|log|finish|today` i stället för en sökväg.
Tidszon är `Europe/Stockholm` som standard (ändra med `?tz=…`).

Exempel på svar från `next`:

```json
{
  "done": false,
  "sessionId": "…",
  "sessionName": "Push",
  "exercise": "Bänkpress",
  "sessionExerciseId": "…",
  "setNumber": 2,
  "totalSets": 3,
  "type": "working",
  "reps": 8,
  "weight": 82.5,
  "weightKg": 82.5,
  "weightText": "82,5 kg",
  "unit": "kg",
  "restSec": 120,
  "restText": "2:00",
  "reason": "↑ Höj till 82,5 kg – du klarade 3 × 12 förra passet",
  "completedSets": 1,
  "plannedSets": 12,
  "text": "Bänkpress – set 2 av 3: 8 × 82,5 kg"
}
```

- `weight` är i din valda enhet (kg eller lb enligt inställningarna), `weightKg` alltid i kg.
  `weight` är `null` första gången du kör en övning – då måste du ange vikt när du loggar.
- För tidsövningar (t.ex. planka) betyder `reps` sekunder.
- När alla set är klara: `{ "done": true, "text": "Alla set klara! Avsluta passet?" }`.
- `log` svarar med samma fält för **nästa** set plus `logged` (t.ex. "Loggat: Bänkpress 8 × 82,5 kg.")
  och `text` = "Loggat: Bänkpress 8 × 82,5 kg. Vila 2:00. Nästa: Bänkpress – set 3 av 3: 8 × 82,5 kg".
- Vikt och reps får skickas som text med decimalkomma (`"82,5"`), så det spelar ingen roll om
  Genvägar skickar tal eller text.

## 4. Genväg "Nästa set"

Visar (och läser upp) vad du ska göra härnäst. Startar dagens pass om inget pågår.

1. Öppna **Genvägar** på iPhone → tryck **+** → döp genvägen till **Nästa set**.
2. Lägg till åtgärden **Text** och klistra in adressen följd av `/next?start=1`, t.ex.
   `https://abcd1234.supabase.co/functions/v1/watch/next?start=1`.
3. Lägg till **Hämta innehållet i URL**. Den använder automatiskt texten ovan som URL.
   - Tryck på pilen (**Visa mer**).
   - **Metod**: `GET`.
   - **Rubriker** → **Lägg till ny rubrik**: nyckel `x-api-key`, värde = din API-nyckel (`gl_…`).
4. Lägg till **Hämta ordboksvärde**: Hämta **Värde** för **Nyckel** `text` i **Innehåll i URL**.
5. Lägg till **Visa resultat** med **Ordboksvärde** (eller **Tala text** om du vill höra det i AirPods).

Klart! Kör genvägen – du ska se t.ex. "Startade Push. Bänkpress – set 1 av 3: 8 × 82,5 kg".
På en vilodag svarar den "Vilodag idag".

## 5. Genväg "Logga set"

Frågar efter reps och vikt med förslaget ifyllt, loggar setet och visar nästa set.

1. Ny genväg → döp den till **Logga set**.
2. **Hämta nästa set** (samma som i avsnitt 4):
   - **Text**: `…/watch/next?start=1`
   - **Hämta innehållet i URL** (Metod `GET`, rubrik `x-api-key` = din nyckel).
   - Lägg till **Ange variabel**: döp variabeln till `Nästa`, värde **Innehåll i URL**.
3. **Fråga efter reps**:
   - **Hämta ordboksvärde**: **Värde** för `reps` i `Nästa`.
   - **Fråga efter inmatning**: Fråga = "Reps?", **Indatatyp** = **Nummer**, **Standardsvar** = **Ordboksvärde**.
   - **Ange variabel** `Reps` = **Inmatning**.
4. **Fråga efter vikt**:
   - **Hämta ordboksvärde**: **Värde** för `weight` i `Nästa`.
   - **Fråga efter inmatning**: Fråga = "Vikt?", **Indatatyp** = **Nummer**, **Standardsvar** = **Ordboksvärde**.
     (Tillåt decimaler under **Visa mer**.)
   - **Ange variabel** `Vikt` = **Inmatning**.
5. **Skicka setet**:
   - **Text**: `…/watch/log`
   - **Hämta innehållet i URL**:
     - **Metod**: `POST`
     - **Rubriker**: `x-api-key` = din nyckel
     - **Begärans brödtext** (Request Body): **JSON**, lägg till fälten
       - `reps` (typ **Nummer**) = variabeln `Reps`
       - `weight` (typ **Nummer**) = variabeln `Vikt`
       - valfritt `rpe` (Nummer) – lägg i så fall till en tredje **Fråga efter inmatning** först.
6. **Hämta ordboksvärde**: `text` i **Innehåll i URL**.
7. **Visa resultat** (eller **Tala text**) med **Ordboksvärde**.

Resultatet blir t.ex. "Loggat: Bänkpress 8 × 82,5 kg. Vila 2:00. Nästa: Bänkpress – set 3 av 3: 8 × 82,5 kg".

> Tips: Vill du hoppa över steget med vikt (oftast samma som förslaget)? Ta bort steg 4 och fältet
> `weight` – API:t använder då den föreslagna vikten.
>
> Visa gärna förslaget innan frågan: lägg till **Hämta ordboksvärde** `text` i `Nästa` och använd det
> som fråga i **Fråga efter inmatning** i stället för "Reps?".

## 6. Genväg "Logga som föreslaget" (ett tryck)

Det snabbaste sättet mitt i ett set – loggar exakt det föreslagna (reps och vikt) utan frågor.

1. Ny genväg **Logga som föreslaget**.
2. **Text**: `…/watch/log`
3. **Hämta innehållet i URL**: Metod `POST`, rubrik `x-api-key` = din nyckel, ingen brödtext.
4. **Hämta ordboksvärde** `text` → **Visa resultat** (eller **Tala text**).

Lägg den här genvägen som komplikation på urtavlan eller på Åtgärdsknappen (se avsnitt 8).

## 7. Genväg "Avsluta pass"

1. Ny genväg **Avsluta pass**.
2. **Text**: `…/watch/finish`
3. **Hämta innehållet i URL**: Metod `POST`, rubrik `x-api-key` = din nyckel.
4. **Hämta ordboksvärde** `text` → **Visa resultat**.

Svaret blir t.ex. "Passet Push är avslutat: 12 set på 54 min, total volym 6480 kg. Bra jobbat!".
Personbästan och full sammanfattning ser du i webbappen.

Vill du även ha en genväg **Dagens pass**: samma mönster med `GET …/watch/today`.

> Tips: Gör en enda genväg **Gym** med åtgärden **Välj från meny** (alternativ "Nästa set", "Logga set",
> "Logga som föreslaget", "Avsluta pass") och lägg respektive steg under varje alternativ. Då räcker en
> komplikation på urtavlan.

## 8. Få upp genvägarna på klockan

**Visa på Apple Watch**
1. Öppna genvägen i Genvägar på iPhone och tryck på **ⓘ** (Information) längst ned.
2. Slå på **Visa på Apple Watch**.
3. Genvägen synkas till appen Genvägar på klockan inom någon minut (iPhone och klocka behöver vara nära
   varandra första gången). Klockan använder iPhones eller sin egen nätverksanslutning för anropen.

**Komplikation på urtavlan**
1. Tryck och håll på urtavlan på klockan → **Redigera**.
2. Svep till komplikationerna, tryck på en plats och välj **Genvägar** → välj t.ex. **Logga set**.
   (Det går också från appen Watch på iPhone → **Urtavlor**.)

**Smart Stack (watchOS 10+)**
1. Vrid Digital Crown uppåt från urtavlan för att öppna Smart Stack.
2. Scrolla längst ned → **Redigera** → **+** → **Genvägar** → välj genvägen.

**Siri**
Genvägens namn är också ett Siri-kommando: säg "Hej Siri, logga set", "Hej Siri, nästa set" eller
"Hej Siri, avsluta pass" – på klockan eller i AirPods. Tala tydligt; korta, unika namn fungerar bäst.

**Åtgärdsknappen (Apple Watch Ultra)**
1. På klockan: **Inställningar** → **Åtgärdsknapp** → **Åtgärd** → **Genväg**.
2. Välj **Logga som föreslaget** (eller **Logga set**). Nu loggar ett tryck på den orange knappen nästa set.

**Tid mellan seten**
Svaret innehåller `restSec`. Vill du ha en vilotimer på klockan: lägg till **Hämta ordboksvärde**
`restSec` och sedan **Starta timer** (Klocka-åtgärden) med det värdet i sekunder.

## 9. Testa med curl

```bash
URL=https://<ditt-projekt-ref>.supabase.co/functions/v1/watch
KEY=gl_dinnyckel

# Dagens pass
curl -s "$URL/today" -H "x-api-key: $KEY"

# Nästa set (startar dagens pass om inget pågår)
curl -s "$URL/next?start=1" -H "x-api-key: $KEY"

# Starta en viss mall (t.ex. på en vilodag)
curl -s -X POST "$URL/start?templateId=Push" -H "x-api-key: $KEY"

# Logga 8 reps på 82,5 kg (vikt i din enhet; "82,5" fungerar också)
curl -s -X POST "$URL/log" -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"reps": 8, "weight": 82.5, "rpe": 8}'

# Logga exakt det föreslagna
curl -s -X POST "$URL/log" -H "x-api-key: $KEY"

# Avsluta passet
curl -s -X POST "$URL/finish" -H "x-api-key: $KEY"
```

Logiken har enhetstester som körs med Deno (efter `npm run engine:sync`):

```bash
deno test supabase/functions/watch/
```

## 10. Felsökning

| Svar | Orsak / åtgärd |
| --- | --- |
| 401 "API-nyckel saknas" | Rubriken `x-api-key` saknas eller är felstavad i **Hämta innehållet i URL**. |
| 401 "Ogiltig API-nyckel" | Nyckeln är återkallad eller felkopierad. Skapa en ny under Inställningar → Apple Watch. |
| 401 "Missing authorization header" / "Invalid JWT" | Funktionen är driftsatt utan `--no-verify-jwt`. Driftsätt igen med flaggan. |
| "Inget aktivt program" | Välj ett aktivt program i webbappen, eller starta med `templateId`. |
| "Vilodag idag" | Dagens veckodag har inget pass. Starta ändå med `POST /watch/start?templateId=<mall>`. |
| "Ange vikt – det finns inget förslag …" | Första gången du kör övningen – skicka med `weight`. |
| 409 "Inget pågående pass" | Kör "Nästa set" (med `start=1`) först. |
| Webbappen visar inte setet | Webbappen hämtar ändringar vid synk – öppna appen med nät, eller vänta en stund. |

Bra att veta:
- Startar du ett pass i webbappen medan du är offline och samtidigt via klockan kan du få två pass.
  Avsluta eller ta bort det ena i webbappen.
- Klockan skapar bara nya set och ändrar bara status/sluttid på passet – den skriver aldrig över set
  du redan loggat i webbappen.
