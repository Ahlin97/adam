# Kravspecifikation (webbversion)

> Ursprunglig specifikation för en native iPhone/Apple Watch-app, anpassad till webb enligt avsnittet
> "Teknik (webbversion)" längst ned. Avsnitt 6 och 7 samt fas 5–6 i originalet gäller inte.

## Uppdrag
Bygg en app för styrketräning på gym. Jag ska kunna välja ut mina övningar, bygga pass och veckoscheman, logga reps och vikt för varje set – och appen ska säga till när det är dags att höja vikten. Appen är för personligt bruk, ska vara snabb att använda mitt i ett pass och fungera utan nätverk.

## Grundprinciper
- Ett set ska kunna bekräftas med ett tryck, förifyllt med föreslagna reps och vikt.
- Data lagras i Supabase med lokal cache (IndexedDB). Ingen spårning.
- Gränssnitt på svenska, kg som standard (lb valbart), svensk formatering (82,5 kg).
- Mörkt tema som standard, stora tryckytor, hög kontrast, går att använda med en hand. Respektera textstorlek och skärmläsare (semantisk HTML, aria-etiketter).

## 1. Övningsbibliotek
- Förinlagt bibliotek med ca 80–100 vanliga gymövningar (knäböj, marklyft, bänkpress, axelpress, rodd, chins, dips, benpress, latsdrag, curl, sidolyft m.fl.) med primär och sekundär muskelgrupp, utrustning (skivstång, hantlar, maskin, kabel, kroppsvikt, kettlebell) och typ (flerleds/isolering).
- Egna övningar: namn, muskelgrupp, utrustning, teknikanteckningar, eget viktsteg samt flaggor för unilateral (vikt per hand/sida) och kroppsvikt (med extravikt eller assistans).
- Övningstyper: vikt × reps, kroppsvikt × reps, tid (t.ex. planka).
- Sök, filter på muskelgrupp och utrustning, favoriter.

## 2. Pass och scheman
- Passmallar (t.ex. "Push", "Ben", "Helkropp A") med övningar i ordning. Per övning: antal set, repsintervall (t.ex. 8–12) eller fasta reps (t.ex. 5 × 5), valfritt mål-RPE, vilotid, uppvärmningsset och progressionsregel. Stöd för superset.
- Program som antingen följer veckodagar (mån = Push, ons = Pull …) eller roterar mallarna i ordning (A → B → C) oavsett dag.
- Färdiga startprogram: helkropp 3 dagar/vecka, överkropp/underkropp 4 dagar, push/pull/ben, enkel 5 × 5-styrka.
- Startsidan visar dagens pass ("Idag: Ben – 5 övningar, ca 55 min") och vad som står på tur.
- Valfria påminnelser på träningsdagar.

## 3. Logga ett pass
- Starta från schemat, en mall eller ett tomt pass. Lägg till, ta bort, flytta eller byt ut övningar under passet.
- Varje set är förifyllt med appens förslag (avsnitt 4) och visar "Förra gången: 3 × 10 @ 60 kg". Justera vikt och reps med +/− (vikten i övningens viktsteg) och bekräfta med ett tryck.
- Settyper: uppvärmning, arbetsset, dropset, till failure. Valfritt RPE (6–10) per set.
- Vilotimern startar automatiskt när ett set bekräftas, med vibration och ljud när vilan är slut. Går att förlänga eller korta.
- Skivkalkylator: vilka skivor som ska på per sida (inställbar stångvikt och tillgängliga skivor).
- Anteckningar per övning och pass.
- Spara efter varje set – ett pågående pass får aldrig försvinna om appen stängs eller kraschar.
- Avslut: sammanfattning med tid, antal set, total volym (vikt × reps) och nya personbästan.

## 4. Progression – när ska jag höja?
Bygg en fristående, testbar progressionsmotor (rena funktioner) som räknar ut förslaget för nästa pass, per övning. Förslaget visas alltid med en kort motivering, t.ex. "↑ Höj till 82,5 kg – du klarade 3 × 12 förra passet", och kan ignoreras. Bara arbetsset räknas.

Dubbel progression (standard för repsintervall):
- Alla arbetsset når intervallets tak → höj ett viktsteg och börja om på intervallets golv.
- Alla set inom intervallet men inte alla vid taket → behåll vikten och sikta på fler reps.
- Något set under intervallets golv → behåll vikten. Tre sådana pass i rad på samma vikt → föreslå deload med 10 %.

Linjär progression (fasta reps, t.ex. 5 × 5):
- Alla set klarade → höj ett viktsteg. Missat → samma vikt igen. Tre missade pass i rad → deload med 10 %.

Gemensamma regler:
- Standardsteg som går att ändra per övning: skivstång underkropp 5 kg, skivstång överkropp 2,5 kg, hantlar 2 kg, maskin och kabel 5 kg.
- Avrunda alltid till en vikt som faktiskt går att ta med min utrustning (stång, skivor, hantlar, maskinsteg).
- Om ett steg är mer än ca 10 % av nuvarande vikt (t.ex. lätta hantelövningar) → kräv 2 reps över taket innan höjning.
- Om RPE loggas: höj bara om snittet på arbetsseten är högst 9.
- Kroppsviktsövningar: progression via reps; vid taket föreslås extravikt (eller mindre assistans).
- Efter uppehåll (mer än 14 dagar sedan övningen kördes) → föreslå ca 10 % lägre vikt.
- Första gången en övning körs: fråga efter startvikt.
- Markera övningar som är "redo att höja" redan i passöversikten.
- Uppskattat 1RM med Epleys formel: vikt × (1 + reps / 30).
- Platå: om uppskattat 1RM inte ökat på 4 veckor → föreslå deload eller nytt repsintervall.

Acceptanstester (ska finnas som enhetstester):
- 8–12 reps, steg 2,5 kg, förra passet 12/12/12 @ 80 kg → 3 × 8 @ 82,5 kg.
- Förra passet 12/11/10 @ 80 kg → 80 kg, mål fler reps.
- Tre pass i rad med något set under 8 reps @ 80 kg → 72,5 kg (80 × 0,9 avrundat till närmaste 2,5).
- 5 × 5, steg 5 kg, alla set klarade @ 100 kg → 5 × 5 @ 105 kg.
- 5 × 5 @ 100 kg med ett set på 4 reps → 100 kg igen.

## 5. Historik och statistik
- Kalender och lista över genomförda pass; öppna ett pass och redigera set i efterhand.
- Per övning: grafer över tyngsta vikt, uppskattat 1RM och volym över tid, plus personbästan (tyngsta vikt, bästa 1RM, flest reps på en viss vikt).
- Antal arbetsset per muskelgrupp och vecka, samt antal pass per vecka.
- Export till CSV och JSON, import från CSV (t.ex. från en annan träningsapp).

## Inställningar
kg/lb, stångvikt, tillgängliga skivor och hantlar, standardvila, standardregler för progression.

## Teknik (webbversion)
- React, TypeScript och Tailwind, Supabase för inloggning och databas.
- Installerbar PWA byggd mobil-först. Ett pågående pass sparas lokalt efter varje set och fungerar utan nät; synka när nätet är tillbaka.
- Håll skärmen tänd under passet och ge en tydlig signal (visuell + ljud) när vilan är slut.
- Progressionsmotorn som en ren TypeScript-modul med enhetstester (samma acceptanstester som ovan).
- Apple Watch: en Supabase Edge Function med personlig API-nyckel som returnerar nästa set i dagens pass och tar emot reps och vikt, så att jag kan logga från klockan med en Genväg (Shortcuts). Beskriv i README hur jag bygger Genvägen steg för steg.

## Datamodell
Exercise, WorkoutTemplate (med TemplateExercise), Program (veckodagar eller rotation), WorkoutSession (med SessionExercise), SetEntry, Settings. Progressionsstatus härleds från historiken.

## Faser
1. Datamodell, övningsbibliotek med startdata, passmallar och program
2. Logga pass med vilotimer, samt historik
3. Progressionsmotorn med tester och förslag i loggvyn
4. Statistik och grafer
5. API:t för klockan och offlinestöd
