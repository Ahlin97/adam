// Builtin exercise library. Ids are stable (prefix `bi-`) and must NEVER change –
// they are referenced by templates, sessions and sets, and synced between devices.
import type { BodyweightMode, Equipment, Exercise, ExerciseCategory, MeasureType, MuscleGroup } from '@/engine';

interface Opts {
  measure?: MeasureType;
  unilateral?: boolean;
  bodyweightMode?: BodyweightMode;
  notes?: string;
}

function ex(
  id: string,
  name: string,
  primaryMuscle: MuscleGroup,
  secondaryMuscles: MuscleGroup[],
  equipment: Equipment,
  category: ExerciseCategory,
  opts: Opts = {},
): Exercise {
  return {
    id,
    name,
    primaryMuscle,
    secondaryMuscles,
    equipment,
    category,
    measure: opts.measure ?? 'weight_reps',
    unilateral: opts.unilateral ?? false,
    bodyweightMode: opts.bodyweightMode ?? 'none',
    weightStep: null,
    notes: opts.notes ?? '',
    isCustom: false,
    isFavorite: false,
  };
}

const C = 'compound' as const;
const I = 'isolation' as const;
/** Two dumbbells / one per hand: weight is logged per hand. */
const perHand = { unilateral: true };
const bwAdded = { measure: 'bodyweight_reps' as const, bodyweightMode: 'added' as const };
const bwAssisted = { measure: 'bodyweight_reps' as const, bodyweightMode: 'assisted' as const };
const bw = { measure: 'bodyweight_reps' as const, bodyweightMode: 'none' as const };
const timed = { measure: 'time' as const };

export const BUILTIN_EXERCISES: Exercise[] = [
  // ---------- Bröst ----------
  ex('bi-bench-press', 'Bänkpress', 'chest', ['triceps', 'shoulders'], 'barbell', C, {
    notes: 'Skulderbladen ihop, fötterna i golvet och sänk stången kontrollerat till nedre bröstet.',
  }),
  ex('bi-incline-bench-press', 'Lutande bänkpress', 'chest', ['shoulders', 'triceps'], 'barbell', C, {
    notes: 'Bänken i ca 30°, sänk stången mot övre bröstet.',
  }),
  ex('bi-decline-bench-press', 'Nedåtlutande bänkpress', 'chest', ['triceps', 'shoulders'], 'barbell', C),
  ex('bi-close-grip-bench-press', 'Smal bänkpress', 'triceps', ['chest', 'shoulders'], 'barbell', C, {
    notes: 'Greppet axelbrett, armbågarna nära kroppen.',
  }),
  ex('bi-db-bench-press', 'Hantelpress', 'chest', ['triceps', 'shoulders'], 'dumbbell', C, {
    ...perHand,
    notes: 'Vikten anges per hantel. Pressa uppåt och lätt inåt.',
  }),
  ex('bi-incline-db-press', 'Lutande hantelpress', 'chest', ['shoulders', 'triceps'], 'dumbbell', C, perHand),
  ex('bi-db-fly', 'Hantelflyes', 'chest', ['shoulders'], 'dumbbell', I, {
    ...perHand,
    notes: 'Lätt böjda armbågar, känn sträckningen i bröstet i bottenläget.',
  }),
  ex('bi-cable-fly', 'Kabelflyes', 'chest', ['shoulders'], 'cable', I, {
    notes: 'För ihop händerna framför bröstet i en båge med låsta armbågar.',
  }),
  ex('bi-pec-deck', 'Butterfly i maskin', 'chest', ['shoulders'], 'machine', I),
  ex('bi-machine-chest-press', 'Bröstpress i maskin', 'chest', ['triceps', 'shoulders'], 'machine', C),
  ex('bi-pushup', 'Armhävningar', 'chest', ['triceps', 'shoulders', 'abs'], 'bodyweight', C, {
    ...bw,
    notes: 'Kroppen rak som en planka, bröstet nästan till golvet.',
  }),
  ex('bi-dips', 'Dips', 'chest', ['triceps', 'shoulders'], 'bodyweight', C, {
    ...bwAdded,
    notes: 'Luta överkroppen lätt framåt och gå ner tills överarmen är parallell med golvet.',
  }),
  ex('bi-assisted-dips', 'Assisterade dips', 'chest', ['triceps', 'shoulders'], 'machine', C, bwAssisted),

  // ---------- Rygg ----------
  ex('bi-deadlift', 'Marklyft', 'glutes', ['hamstrings', 'lower_back', 'quads', 'traps', 'forearms'], 'barbell', C, {
    notes: 'Stången nära smalbenen, rak rygg och pressa golvet ifrån dig.',
  }),
  ex('bi-sumo-deadlift', 'Sumomarklyft', 'glutes', ['quads', 'hamstrings', 'adductors', 'lower_back'], 'barbell', C),
  ex('bi-rack-pull', 'Rackmarklyft', 'lower_back', ['glutes', 'traps', 'hamstrings', 'forearms'], 'barbell', C),
  ex('bi-barbell-row', 'Skivstångsrodd', 'back', ['lats', 'biceps', 'lower_back'], 'barbell', C, {
    notes: 'Fäll fram överkroppen, rak rygg och dra stången mot naveln.',
  }),
  ex('bi-pendlay-row', 'Pendlayrodd', 'back', ['lats', 'biceps', 'lower_back'], 'barbell', C, {
    notes: 'Varje rep startar från golvet med överkroppen parallell med golvet.',
  }),
  ex('bi-tbar-row', 'T-stångsrodd', 'back', ['lats', 'biceps'], 'barbell', C),
  ex('bi-db-row', 'Hantelrodd', 'back', ['lats', 'biceps'], 'dumbbell', C, {
    ...perHand,
    notes: 'Ena handen och knät på bänken, dra hanteln mot höften.',
  }),
  ex('bi-seated-cable-row', 'Sittande kabelrodd', 'back', ['lats', 'biceps'], 'cable', C, {
    notes: 'Bröstet upp, dra handtaget mot magen och för ihop skulderbladen.',
  }),
  ex('bi-machine-row', 'Rodd i maskin', 'back', ['lats', 'biceps'], 'machine', C),
  ex('bi-chinup', 'Chins', 'lats', ['biceps', 'back'], 'bodyweight', C, {
    ...bwAdded,
    notes: 'Underhandsgrepp, från raka armar tills hakan är över stången.',
  }),
  ex('bi-pullup', 'Pull-ups', 'lats', ['back', 'biceps'], 'bodyweight', C, {
    ...bwAdded,
    notes: 'Överhandsgrepp något bredare än axlarna, dra bröstet mot stången.',
  }),
  ex('bi-assisted-chinup', 'Assisterade chins', 'lats', ['biceps', 'back'], 'machine', C, {
    ...bwAssisted,
    notes: 'Vikten är assistans – lägre vikt betyder tyngre.',
  }),
  ex('bi-assisted-pullup', 'Assisterade pull-ups', 'lats', ['back', 'biceps'], 'machine', C, {
    ...bwAssisted,
    notes: 'Vikten är assistans – lägre vikt betyder tyngre.',
  }),
  ex('bi-lat-pulldown', 'Latsdrag', 'lats', ['back', 'biceps'], 'cable', C, {
    notes: 'Dra stången mot övre bröstet med bröstet upp, undvik att gunga.',
  }),
  ex('bi-close-grip-pulldown', 'Latsdrag smalt grepp', 'lats', ['back', 'biceps'], 'cable', C),
  ex('bi-straight-arm-pulldown', 'Latsdrag med raka armar', 'lats', ['triceps'], 'cable', I),
  ex('bi-inverted-row', 'Inverterad rodd', 'back', ['lats', 'biceps'], 'bodyweight', C, bw),
  ex('bi-face-pull', 'Facepulls', 'shoulders', ['traps', 'back'], 'cable', I, {
    notes: 'Rep i ansiktshöjd, dra mot pannan och rotera ut händerna.',
  }),
  ex('bi-barbell-shrug', 'Shrugs med skivstång', 'traps', ['forearms'], 'barbell', I),
  ex('bi-db-shrug', 'Shrugs med hantlar', 'traps', ['forearms'], 'dumbbell', I, perHand),
  ex('bi-back-extension', 'Rygglyft', 'lower_back', ['glutes', 'hamstrings'], 'bodyweight', I, {
    ...bwAdded,
    notes: 'Håll en viktskiva mot bröstet för extravikt.',
  }),
  ex('bi-good-morning', 'Good morning', 'hamstrings', ['lower_back', 'glutes'], 'barbell', C),

  // ---------- Axlar ----------
  ex('bi-overhead-press', 'Axelpress', 'shoulders', ['triceps', 'traps'], 'barbell', C, {
    notes: 'Stående, spänn säte och mage och pressa stången rakt upp förbi ansiktet.',
  }),
  ex('bi-push-press', 'Push press', 'shoulders', ['triceps', 'quads'], 'barbell', C),
  ex('bi-db-shoulder-press', 'Axelpress med hantlar', 'shoulders', ['triceps'], 'dumbbell', C, perHand),
  ex('bi-arnold-press', 'Arnoldpress', 'shoulders', ['triceps'], 'dumbbell', C, perHand),
  ex('bi-machine-shoulder-press', 'Axelpress i maskin', 'shoulders', ['triceps'], 'machine', C),
  ex('bi-lateral-raise', 'Sidolyft', 'shoulders', ['traps'], 'dumbbell', I, {
    ...perHand,
    notes: 'Lyft ut åt sidorna till axelhöjd med lätt böjda armbågar.',
  }),
  ex('bi-cable-lateral-raise', 'Sidolyft i kabel', 'shoulders', [], 'cable', I, perHand),
  ex('bi-machine-lateral-raise', 'Sidolyft i maskin', 'shoulders', [], 'machine', I),
  ex('bi-front-raise', 'Framåtlyft', 'shoulders', ['chest'], 'dumbbell', I, perHand),
  ex('bi-rear-delt-fly', 'Omvända flyes', 'shoulders', ['back', 'traps'], 'dumbbell', I, {
    ...perHand,
    notes: 'Framåtfälld överkropp, lyft ut åt sidorna för bakre axeln.',
  }),
  ex('bi-reverse-pec-deck', 'Omvänd butterfly i maskin', 'shoulders', ['back', 'traps'], 'machine', I),
  ex('bi-upright-row', 'Upprätt rodd', 'shoulders', ['traps', 'biceps'], 'barbell', C),
  ex('bi-landmine-press', 'Landminepress', 'shoulders', ['chest', 'triceps'], 'barbell', C),

  // ---------- Biceps ----------
  ex('bi-db-curl', 'Bicepscurl med hantlar', 'biceps', ['forearms'], 'dumbbell', I, {
    ...perHand,
    notes: 'Armbågarna stilla vid sidan, ingen gungning.',
  }),
  ex('bi-barbell-curl', 'Bicepscurl med skivstång', 'biceps', ['forearms'], 'barbell', I),
  ex('bi-ez-curl', 'Curl med EZ-stång', 'biceps', ['forearms'], 'barbell', I),
  ex('bi-hammer-curl', 'Hammercurl', 'biceps', ['forearms'], 'dumbbell', I, {
    ...perHand,
    notes: 'Neutralt grepp med tummarna uppåt.',
  }),
  ex('bi-incline-db-curl', 'Lutande hantelcurl', 'biceps', ['forearms'], 'dumbbell', I, perHand),
  ex('bi-concentration-curl', 'Koncentrationscurl', 'biceps', [], 'dumbbell', I, perHand),
  ex('bi-preacher-curl', 'Scottcurl', 'biceps', ['forearms'], 'machine', I),
  ex('bi-cable-curl', 'Bicepscurl i kabel', 'biceps', ['forearms'], 'cable', I),

  // ---------- Triceps ----------
  ex('bi-triceps-pushdown', 'Tricepspress i kabel', 'triceps', [], 'cable', I, {
    notes: 'Armbågarna låsta mot sidorna, sträck ut helt i botten.',
  }),
  ex('bi-rope-pushdown', 'Tricepspress med rep', 'triceps', [], 'cable', I),
  ex('bi-overhead-cable-extension', 'Triceps över huvudet i kabel', 'triceps', [], 'cable', I),
  ex('bi-skullcrusher', 'Skullcrushers', 'triceps', [], 'barbell', I, {
    notes: 'Liggande med EZ-stång, sänk mot pannan med stilla överarmar.',
  }),
  ex('bi-db-overhead-extension', 'Fransk press med hantel', 'triceps', [], 'dumbbell', I, {
    notes: 'En hantel med båda händerna bakom huvudet.',
  }),
  ex('bi-triceps-kickback', 'Kickbacks', 'triceps', [], 'dumbbell', I, perHand),
  ex('bi-bench-dips', 'Bänkdips', 'triceps', ['chest', 'shoulders'], 'bodyweight', C, bw),

  // ---------- Underarmar ----------
  ex('bi-wrist-curl', 'Handledscurl', 'forearms', [], 'barbell', I),
  ex('bi-farmers-walk', 'Farmers walk', 'forearms', ['traps', 'abs', 'full_body'], 'dumbbell', C, {
    ...perHand,
    notes: 'Gå med en tung hantel i varje hand, rak hållning.',
  }),

  // ---------- Ben ----------
  ex('bi-squat', 'Knäböj', 'quads', ['glutes', 'hamstrings', 'lower_back'], 'barbell', C, {
    notes: 'Stången på övre ryggen, böj till minst parallellt med knäna över tårna.',
  }),
  ex('bi-front-squat', 'Frontböj', 'quads', ['glutes', 'abs'], 'barbell', C, {
    notes: 'Stången vilar på framsidan av axlarna, armbågarna högt.',
  }),
  ex('bi-goblet-squat', 'Gobletknäböj', 'quads', ['glutes'], 'dumbbell', C, {
    notes: 'Håll en hantel mot bröstet och sitt ner mellan knäna.',
  }),
  ex('bi-hack-squat', 'Hackböj', 'quads', ['glutes'], 'machine', C),
  ex('bi-smith-squat', 'Knäböj i smithmaskin', 'quads', ['glutes', 'hamstrings'], 'machine', C),
  ex('bi-leg-press', 'Benpress', 'quads', ['glutes', 'hamstrings'], 'machine', C, {
    notes: 'Låt inte ländryggen lyfta från dynan i bottenläget.',
  }),
  ex('bi-leg-extension', 'Bensträck', 'quads', [], 'machine', I),
  ex('bi-lying-leg-curl', 'Liggande lårcurl', 'hamstrings', ['calves'], 'machine', I),
  ex('bi-seated-leg-curl', 'Sittande lårcurl', 'hamstrings', [], 'machine', I),
  ex('bi-romanian-deadlift', 'Rumänsk marklyft', 'hamstrings', ['glutes', 'lower_back'], 'barbell', C, {
    notes: 'Lätt böjda knän, för höften bakåt tills du känner sträck i baksida lår.',
  }),
  ex('bi-db-romanian-deadlift', 'Rumänsk marklyft med hantlar', 'hamstrings', ['glutes', 'lower_back'], 'dumbbell', C, perHand),
  ex('bi-hip-thrust', 'Höftlyft', 'glutes', ['hamstrings'], 'barbell', C, {
    notes: 'Övre ryggen mot bänken, pressa höften upp och kläm ihop sätet i toppen.',
  }),
  ex('bi-glute-bridge', 'Sätesbrygga', 'glutes', ['hamstrings'], 'bodyweight', I, bwAdded),
  ex('bi-lunge', 'Utfall', 'quads', ['glutes', 'hamstrings'], 'dumbbell', C, {
    ...perHand,
    notes: 'Vikten anges per hantel. Främre knät över foten, bakre knät nära golvet.',
  }),
  ex('bi-walking-lunge', 'Gående utfall', 'quads', ['glutes', 'hamstrings'], 'dumbbell', C, perHand),
  ex('bi-bulgarian-split-squat', 'Bulgarisk utfallsböj', 'quads', ['glutes', 'hamstrings'], 'dumbbell', C, {
    ...perHand,
    notes: 'Bakre foten på en bänk, sänk rakt ner. Vikten anges per hantel.',
  }),
  ex('bi-step-up', 'Step-ups', 'quads', ['glutes'], 'dumbbell', C, perHand),
  ex('bi-hip-adduction', 'Adduktormaskin', 'adductors', [], 'machine', I),
  ex('bi-hip-abduction', 'Abduktormaskin', 'abductors', ['glutes'], 'machine', I),
  ex('bi-standing-calf-raise', 'Vadpress', 'calves', [], 'machine', I, {
    notes: 'Full rörelse – ända ner och upp på tå, paus i toppen.',
  }),
  ex('bi-seated-calf-raise', 'Sittande vadpress', 'calves', [], 'machine', I),
  ex('bi-leg-press-calf-raise', 'Vadpress i benpress', 'calves', [], 'machine', I),
  ex('bi-kb-swing', 'Kettlebellsving', 'glutes', ['hamstrings', 'lower_back', 'shoulders'], 'kettlebell', C, {
    notes: 'Explosiv höftfällning – kraften kommer från höften, inte armarna.',
  }),
  ex('bi-kb-goblet-squat', 'Gobletknäböj med kettlebell', 'quads', ['glutes'], 'kettlebell', C),
  ex('bi-cable-pull-through', 'Pull-through i kabel', 'glutes', ['hamstrings'], 'cable', C),
  ex('bi-nordic-curl', 'Nordic hamstring curl', 'hamstrings', [], 'bodyweight', I, bw),

  // ---------- Mage ----------
  ex('bi-plank', 'Planka', 'abs', ['obliques', 'shoulders'], 'bodyweight', I, {
    ...timed,
    notes: 'Rak linje från huvud till hälar, spänn mage och säte.',
  }),
  ex('bi-side-plank', 'Sidoplanka', 'obliques', ['abs'], 'bodyweight', I, timed),
  ex('bi-hanging-leg-raise', 'Hängande benlyft', 'abs', ['obliques'], 'bodyweight', I, {
    ...bw,
    notes: 'Häng i raka armar och lyft benen utan att gunga.',
  }),
  ex('bi-cable-crunch', 'Kabelcrunch', 'abs', [], 'cable', I),
  ex('bi-crunch', 'Crunches', 'abs', [], 'bodyweight', I, bw),
  ex('bi-ab-wheel', 'Magrulle', 'abs', ['lats', 'shoulders'], 'other', I, bw),
  ex('bi-russian-twist', 'Russian twist', 'obliques', ['abs'], 'bodyweight', I, bwAdded),
  ex('bi-pallof-press', 'Pallof press', 'obliques', ['abs'], 'cable', I),
];
