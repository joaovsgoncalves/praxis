#!/usr/bin/env node
/**
 * scripts/translate-exercise-instructions.mjs
 *
 * Praxis Treinos V4 Fase 14 — Portuguese Exercise Instructions for Active Program & Top-Used Exercises.
 *
 * Translates English instructions for active program exercises and top-20 used exercises into Portuguese.
 * Stores translated steps in instructions_json.pt.
 *
 * Rules:
 * 1. Default mode is --dry-run (no DB writes). Use --apply to persist changes.
 * 2. Selects exercises linked to active program days UNION top 20 exercises by completed work-set count.
 * 3. Never overwrites existing non-empty pt steps.
 * 4. Custom exercises without EN steps are skipped (untouched).
 * 5. Deterministic local translation function (no external/paid API calls).
 *
 * Flags:
 *   --dry-run   Default mode. Inspects candidates and displays preview without writing to DB.
 *   --apply     Persists translated PT steps to SQLite.
 *   --db=PATH   Explicit path to SQLite database.
 *   --silent    Suppresses output logging.
 *
 * Usage:
 *   node scripts/translate-exercise-instructions.mjs           # Dry-run
 *   node scripts/translate-exercise-instructions.mjs --apply   # Apply to DB
 *   npm run translate:exercise-pt
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const apiDir = path.join(workspaceRoot, "api");

/**
 * Robustly load better-sqlite3 across workspace module layouts.
 */
export async function getDatabaseClass() {
  try {
    const mod = await import("better-sqlite3");
    return mod.default || mod;
  } catch {
    const apiRequire = createRequire(path.join(apiDir, "server.js"));
    return apiRequire("better-sqlite3");
  }
}

/**
 * Resolve DB path matching api/server.js, scripts/seed-exercise-catalog.mjs, and scripts/praxis-backup.sh.
 */
export function resolvePraxisDbPath(customPath = null) {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }

  const envPath = process.env.FORJA_DB || process.env.PRAXIS_DB_PATH || process.env.PRAXIS_DB;
  if (envPath) {
    return path.resolve(process.cwd(), envPath);
  }

  const targetPath = path.join(apiDir, "praxis.db");
  const legacyPath = path.join(apiDir, "forja.db");

  if (fs.existsSync(targetPath)) return targetPath;
  if (fs.existsSync(legacyPath)) {
    try {
      for (const suffix of ["", "-wal", "-shm"]) {
        const from = legacyPath + suffix;
        if (fs.existsSync(from)) fs.copyFileSync(from, targetPath + suffix);
      }
    } catch {
      // fallback
    }
    return targetPath;
  }

  return targetPath;
}

const EXACT_STEP_TRANSLATIONS = {
  "Lie flat on your back with your knees bent and feet flat on the ground.": "Deite-se de costas com os joelhos flexionados e os pés apoiados no chão.",
  "Lie flat on your back with your knees bent and feet flat on the floor.": "Deite-se de costas com os joelhos flexionados e os pés apoiados no chão.",
  "Lie flat on a bench with your feet flat on the ground.": "Deite-se no banco reto com os pés apoiados no chão.",
  "Lie flat on the bench with your feet flat on the ground.": "Deite-se no banco com os pés apoiados no chão.",
  "Lie flat on a bench with your feet firmly on the ground.": "Deite-se no banco com os pés firmemente apoiados no chão.",
  "Lie on an incline bench with your feet flat on the floor.": "Deite-se no banco inclinado com os pés apoiados no chão.",
  "Lie on a decline bench with your feet secured under the pads.": "Deite-se no banco declinado com os pés travados nos apoios.",
  "Stand with your feet shoulder-width apart.": "Fique em pé com os pés na largura dos ombros.",
  "Stand with your feet shoulder-width apart and knees slightly bent.": "Fique em pé com os pés na largura dos ombros e joelhos levemente flexionados.",
  "Stand with feet shoulder-width apart and your back straight.": "Fique em pé com os pés na largura dos ombros e a coluna reta.",
  "Stand tall with your feet hip-width apart.": "Fique em pé com a postura ereta e os pés na largura do quadril.",
  "Sit on a bench with your back straight and feet flat on the floor.": "Sente-se no banco com a coluna ereta e os pés apoiados no chão.",
  "Sit on the machine with your back flat against the pad.": "Sente-se na máquina com as costas apoiadas no encosto.",
  "Sit on the machine with your chest against the pad.": "Sente-se na máquina com o peito apoiado no encosto frontal.",
  "Adjust the seat so that the handles align with your chest.": "Ajuste o assento para que as pegadas fiquem alinhadas com o meio do peito.",
  "Adjust the seat height so that your knees align with the pivot point.": "Ajuste a altura do assento para que os joelhos fiquem alinhados com o eixo de rotação.",
  "Start on all fours with your hands directly under your shoulders and your knees directly under your hips.": "Comece na posição de quatro apoios com as mãos sob os ombros e os joelhos sob os quadris.",
  "Place your hands behind your head with your elbows pointing outwards.": "Posicione as mãos atrás da cabeça com os cotovelos apontando para fora.",
  "Hold a dumbbell in each hand with an overhand grip.": "Segure um halter em cada mão com pegada pronada.",
  "Hold a dumbbell in each hand with an underhand grip.": "Segure um halter em cada mão com pegada supinada.",
  "Hold a dumbbell in each hand with a neutral grip (palms facing each other).": "Segure um halter em cada mão com pegada neutra (palmas voltadas uma para a outra).",
  "Hold a dumbbell in each hand with arms extended straight down at your sides.": "Segure um halter em cada mão com os braços estendidos ao lado do corpo.",
  "Grip the barbell with hands slightly wider than shoulder-width apart.": "Segure a barra com as mãos ligeiramente mais afastadas que a largura dos ombros.",
  "Grasp the bar with an overhand grip, hands slightly wider than shoulder-width.": "Segure a barra com pegada pronada, mãos ligeiramente mais abertas que os ombros.",
  "Grasp the pull-up bar with an overhand grip, hands wider than shoulder-width.": "Segure a barra fixa com pegada pronada, mãos mais afastadas que a largura dos ombros.",
  "Grasp the handles with an overhand grip.": "Segure as manoplas com pegada pronada.",
  "Grasp the handles with a neutral grip.": "Segure as manoplas com pegada neutra.",
  "Attach a rope handle to the high pulley.": "Prenda a corda na polia alta.",
  "Attach a straight bar to the low pulley.": "Prenda a barra reta na polia baixa.",
  "Engaging your abs, slowly lift your upper body off the ground, curling forward until your torso is at a 45-degree angle.": "Contraindo o abdômen, eleve lentamente o tronco do chão, flexionando para a frente até cerca de 45 graus.",
  "Keeping your back straight and your core engaged, slowly bend your torso to one side, lowering your hand towards your knee.": "Mantendo a coluna reta e o abdômen contraído, incline lateralmente o tronco descendo a mão em direção ao joelho.",
  "Lift your legs off the ground and bend your knees at a 90-degree angle.": "Eleve as pernas do chão e flexione os joelhos em um ângulo de 90 graus.",
  "Slowly lower the barbell to your chest, keeping your elbows close to your sides.": "Abaixe a barra devagar até o peito, mantendo os cotovelos próximos ao tronco.",
  "Slowly lower the barbell towards your chest, keeping your elbows at a 45-degree angle to your body.": "Abaixe lentamente a barra em direção ao peito, mantendo os cotovelos a 45 graus do corpo.",
  "Lower the bar slowly to your chest, keeping your elbows close to your sides.": "Abaixe a barra devagar até o peito, mantendo os cotovelos próximos ao tronco.",
  "Push the barbell back up to the starting position, extending your arms fully but without locking your elbows.": "Empurre a barra de volta à posição inicial, estendendo os braços sem travar os cotovelos.",
  "Push the bar back up to the starting position, extending your arms fully.": "Empurre a barra de volta à posição inicial estendendo completamente os braços.",
  "Press the dumbbells straight up until your arms are fully extended.": "Empurre os halteres para cima até a extensão completa dos braços.",
  "Slowly lower the dumbbells back to the starting position at chest level.": "Abaixe lentamente os halteres de volta à posição inicial na altura do peito.",
  "Pull the bar down towards your upper chest, leading with your elbows.": "Puxe a barra em direção à parte superior do peito, direcionando os cotovelos para baixo.",
  "Pull the handles towards your torso, squeezing your shoulder blades together.": "Puxe as manoplas em direção ao tronco, aproximando as escápulas.",
  "Pull the weight towards your abdomen, keeping your elbows close to your body.": "Puxe o peso em direção ao abdômen, mantendo os cotovelos próximos ao corpo.",
  "Pull the rope towards your face, separating your hands and leading with your elbows.": "Puxe a corda em direção ao rosto, afastando as mãos e direcionando os cotovelos para trás.",
  "Raise the dumbbells out to the sides until your arms are parallel to the floor.": "Eleve os halteres lateralmente até que os braços fiquem paralelos ao chão.",
  "Slowly raise the dumbbells forward until they reach shoulder height.": "Eleve lentamente os halteres à frente até a altura dos ombros.",
  "Curl the barbell towards your chest, keeping your upper arms stationary.": "Flexione os cotovelos trazendo a barra em direção ao peito, mantendo os braços fixos.",
  "Curl the weights toward your shoulders while keeping your elbows tucked in.": "Flexione os braços trazendo os pesos em direção aos ombros com os cotovelos fixos.",
  "Lower the weights slowly back to the starting position under full control.": "Abaixe os pesos lentamente de volta à posição inicial com total controle.",
  "Lower your body by bending at the hips and knees as if sitting back into a chair.": "Abaixe o corpo flexionando os quadris e joelhos como se fosse sentar em uma cadeira.",
  "Lower your hips until your thighs are parallel to the floor.": "Abaixe o quadril até as coxas ficarem paralelas ao chão.",
  "Drive through your heels to return to the standing position.": "Empurre o chão com os calcanhares para retornar à posição em pé.",
  "Hinge forward at the hips, keeping your back straight and knees slightly bent.": "Incline o tronco para a frente a partir do quadril, mantendo a coluna reta e joelhos levemente destravados.",
  "Lower the weight along your shins until you feel a stretch in your hamstrings.": "Desça a carga rente às canelas até sentir o alongamento nos posteriores de coxa.",
  "Extend your hips forward to return to the upright position, squeezing your glutes at the top.": "Estenda o quadril para retornar à posição ereta, contraindo os glúteos no topo.",
  "Extend your knees to push the platform away, without locking your knees at the top.": "Estenda os joelhos empurrando a plataforma, sem travar as articulações no topo.",
  "Slowly bend your knees to lower the weight back down in a controlled motion.": "Flexione lentamente os joelhos retornando o peso de maneira controlada.",
  "Raise your heels as high as possible by contracting your calf muscles.": "Eleve os calcanhares o mais alto possível contraindo as panturrilhas.",
  "Lower your heels slowly below the platform level for a full stretch.": "Abaixe os calcanhares lentamente abaixo do nível do apoio para um alongamento completo.",
  "Pause for a moment at the top, then slowly lower your upper body back down to the starting position.": "Faça uma breve pausa no topo e desça lentamente o tronco de volta à posição inicial.",
  "Pause for a moment at the top of the movement.": "Faça uma breve pausa no topo do movimento.",
  "Pause for a moment at the bottom, then slowly return to the starting position.": "Faça uma breve pausa na parte inferior e retorne lentamente à posição inicial.",
  "Pause for a moment at the peak contraction, squeezing your muscles.": "Faça uma breve pausa no pico de contração, apertando a musculatura.",
  "Pause for a moment at the top before slowly returning to the starting position.": "Faça uma pausa no topo antes de retornar lentamente à posição inicial.",
  "Pause for a moment at the bottom of the movement.": "Faça uma breve pausa no ponto mais baixo do movimento.",
  "Pause for a second at the contraction.": "Faça uma pausa de um segundo na contração máxima.",
  "Repeat on the other side.": "Repita o movimento para o outro lado.",
  "Switch sides and repeat the movement.": "Troque de lado e repita o movimento.",
  "Continue alternating sides for the desired number of repetitions.": "Continue alternando os lados pelo número desejado de repetições.",
  "Repeat for the desired number of repetitions.": "Repita pelo número desejado de repetições.",
  "Repeat for the desired number of reps.": "Repita pelo número desejado de repetições.",
  "Repeat for the recommended number of repetitions.": "Repita pelo número recomendado de repetições.",
  "Hold this position for 20-30 seconds.": "Mantenha esta posição por 20 a 30 segundos.",
  "Hold the stretch for 15-30 seconds, then release.": "Sustente o alongamento por 15 a 30 segundos e depois relaxe.",
};

const CLAUSE_REPLACEMENTS = [
  [/\bLie flat on your back with your knees bent and feet flat on the ground\b/gi, "Deite-se de costas com os joelhos flexionados e pés apoiados no chão"],
  [/\bLie flat on your back with your knees bent\b/gi, "Deite-se de costas com os joelhos flexionados"],
  [/\bLie flat on your back\b/gi, "Deite-se de costas no chão"],
  [/\bLie on your back\b/gi, "Deite-se de costas"],
  [/\bLie flat on a bench\b/gi, "Deite-se no banco reto"],
  [/\bLie face down on a bench\b/gi, "Deite-se de bruços no banco"],
  [/\bLie face down on the floor\b/gi, "Deite-se de bruços no chão"],
  [/\bStand with your feet shoulder-width apart\b/gi, "Fique em pé com os pés na largura dos ombros"],
  [/\bStand with feet shoulder-width apart\b/gi, "Fique em pé com os pés na largura dos ombros"],
  [/\bStand tall with your feet hip-width apart\b/gi, "Fique em pé ereto com os pés na largura do quadril"],
  [/\bStand with your feet hip-width apart\b/gi, "Fique em pé com os pés na largura do quadril"],
  [/\bSit upright on a bench\b/gi, "Sente-se com a coluna ereta no banco"],
  [/\bSit on a bench with your back straight\b/gi, "Sente-se no banco com a coluna ereta"],
  [/\bSit on the bench\b/gi, "Sente-se no banco"],
  [/\bSit on the machine\b/gi, "Sente-se na máquina"],
  [/\bStart on all fours\b/gi, "Comece na posição de quatro apoios"],
  [/\bHang from a pull-up bar\b/gi, "Pendure-se na barra fixa"],
  [/\bAdjust the seat height\b/gi, "Ajuste a altura do assento"],
  [/\bAdjust the seat\b/gi, "Ajuste o assento"],
  [/\bHold a dumbbell in each hand\b/gi, "Segure um halter em cada mão"],
  [/\bHold a pair of dumbbells\b/gi, "Segure um par de halteres"],
  [/\bHold the barbell with an overhand grip\b/gi, "Segure a barra com pegada pronada"],
  [/\bHold the barbell with an underhand grip\b/gi, "Segure a barra com pegada supinada"],
  [/\bwith an overhand grip\b/gi, "com pegada pronada"],
  [/\bwith an underhand grip\b/gi, "com pegada supinada"],
  [/\bwith a neutral grip\b/gi, "com pegada neutra"],
  [/\bpalms facing each other\b/gi, "palmas voltadas uma para a outra"],
  [/\bpalms facing forward\b/gi, "palmas voltadas para a frente"],
  [/\bpalms facing your body\b/gi, "palmas voltadas para o corpo"],
  [/\bpalms facing up\b/gi, "palmas voltadas para cima"],
  [/\bpalms facing down\b/gi, "palmas voltadas para baixo"],
  [/\bhands slightly wider than shoulder-width apart\b/gi, "mãos ligeiramente mais afastadas que a largura dos ombros"],
  [/\bhands shoulder-width apart\b/gi, "mãos na largura dos ombros"],
  [/\bshoulder-width apart\b/gi, "na largura dos ombros"],
  [/\bhip-width apart\b/gi, "na largura do quadril"],
  [/\bKeeping your back straight and your core engaged\b/gi, "Mantendo a coluna reta e o abdômen contraído"],
  [/\bKeeping your back straight\b/gi, "Mantendo a coluna reta"],
  [/\bKeep your back straight\b/gi, "Mantenha a coluna reta"],
  [/\bKeep your chest up and shoulders back\b/gi, "Mantenha o peito aberto e ombros alinhados"],
  [/\bKeep your chest up\b/gi, "Mantenha o peito aberto"],
  [/\bEngage your core and maintain a neutral spine\b/gi, "Contraia o abdômen e mantenha a coluna neutra"],
  [/\bEngaging your abs\b/gi, "Contraindo o abdômen"],
  [/\bEngage your core\b/gi, "Contraia o abdômen"],
  [/\bKeep your elbows close to your body\b/gi, "Mantenha os cotovelos próximos ao corpo"],
  [/\bKeep your elbows close to your sides\b/gi, "Mantenha os cotovelos junto ao corpo"],
  [/\bwithout locking your elbows\b/gi, "sem travar os cotovelos"],
  [/\bwithout locking your knees\b/gi, "sem travar os joelhos"],
  [/\bknees slightly bent\b/gi, "joelhos levemente flexionados"],
  [/\bSlowly lower the barbell towards your chest\b/gi, "Abaixe lentamente a barra em direção ao peito"],
  [/\bSlowly lower the barbell to your chest\b/gi, "Abaixe lentamente a barra até o peito"],
  [/\bSlowly lower the dumbbells\b/gi, "Abaixe lentamente os halteres"],
  [/\bSlowly lower the weight\b/gi, "Abaixe lentamente a carga"],
  [/\bSlowly lower your body\b/gi, "Abaixe o corpo lentamente"],
  [/\bSlowly lower your upper body\b/gi, "Abaixe lentamente o tronco"],
  [/\bSlowly lower your arms\b/gi, "Abaixe lentamente os braços"],
  [/\bLower the bar slowly\b/gi, "Abaixe a barra devagar"],
  [/\bLower the weight in a controlled manner\b/gi, "Abaixe o peso de maneira controlada"],
  [/\bPush the barbell back up to the starting position\b/gi, "Empurre a barra de volta à posição inicial"],
  [/\bPush the dumbbells up\b/gi, "Empurre os halteres para cima"],
  [/\bPush through your heels\b/gi, "Empurre através dos calcanhares"],
  [/\bPush back up to the starting position\b/gi, "Empurre de volta à posição inicial"],
  [/\bPull the bar down towards your upper chest\b/gi, "Puxe a barra em direção à parte superior do peito"],
  [/\bPull the handles towards your torso\b/gi, "Puxe as manoplas em direção ao tronco"],
  [/\bPull the weight towards your body\b/gi, "Puxe a carga em direção ao corpo"],
  [/\bPull your elbows back\b/gi, "Puxe os cotovelos para trás"],
  [/\bSqueeze your shoulder blades together\b/gi, "Aproxime as escápulas"],
  [/\bsqueezing your shoulder blades together\b/gi, "contraindo as escápulas"],
  [/\bRaise your arms out to the sides\b/gi, "Eleve os braços para as laterais"],
  [/\bRaise the dumbbells to shoulder height\b/gi, "Eleve os halteres até a altura dos ombros"],
  [/\bRaise your heels as high as possible\b/gi, "Eleve os calcanhares o mais alto possível"],
  [/\bCurl the weight towards your shoulders\b/gi, "Flexione os braços trazendo o peso aos ombros"],
  [/\bHinge forward at the hips\b/gi, "Incline o tronco para a frente a partir do quadril"],
  [/\bExtend your arms fully\b/gi, "Estenda completamente os braços"],
  [/\bExtend your legs\b/gi, "Estenda as pernas"],
  [/\bPause for a moment at the top of the movement\b/gi, "Faça uma breve pausa no topo do movimento"],
  [/\bPause for a moment at the bottom of the movement\b/gi, "Faça uma breve pausa na parte inferior do movimento"],
  [/\bPause for a moment at the top\b/gi, "Faça uma pausa no topo"],
  [/\bPause for a moment at the bottom\b/gi, "Faça uma pausa embaixo"],
  [/\bPause for a second at the peak of contraction\b/gi, "Faça uma pausa de um segundo no pico da contração"],
  [/\bPause for a moment\b/gi, "Faça uma breve pausa"],
  [/\bSlowly return to the starting position\b/gi, "Retorne lentamente à posição inicial"],
  [/\breturn to the starting position\b/gi, "retorne à posição inicial"],
  [/\bto the starting position\b/gi, "à posição inicial"],
  [/\bRepeat on the other side\b/gi, "Repita no outro lado"],
  [/\bRepeat on the opposite side\b/gi, "Repita no lado oposto"],
  [/\bSwitch sides and repeat\b/gi, "Troque de lado e repita"],
  [/\bContinue alternating sides for the desired number of repetitions\b/gi, "Continue alternando os lados pelo número desejado de repetições"],
  [/\bRepeat for the desired number of repetitions\b/gi, "Repita pelo número desejado de repetições"],
  [/\bRepeat for the desired number of reps\b/gi, "Repita pelo número desejado de repetições"],
  [/\bRepeat for the recommended number of repetitions\b/gi, "Repita pelo número recomendado de repetições"],
  [/\bfor the desired number of repetitions\b/gi, "pelo número desejado de repetições"],
  [/\bfor the desired number of reps\b/gi, "pelo número desejado de repetições"],
  [/\bHold this position for 20-30 seconds\b/gi, "Mantenha esta posição por 20 a 30 segundos"],
  [/\bHold for 15-30 seconds\b/gi, "Sustente por 15 a 30 segundos"],
  [/\bInhale as you lower\b/gi, "Inspire ao descer"],
  [/\bExhale as you lift\b/gi, "Expire ao subir"],
  [/\bExhale as you push\b/gi, "Expire ao empurrar"],
  [/\bExhale as you pull\b/gi, "Expire ao puxar"],
  [/\bin a slow and controlled motion\b/gi, "de forma lenta e controlada"],
  [/\bin a controlled motion\b/gi, "de forma controlada"],
  [/\bunder control\b/gi, "com controle"],
];

function translateSingleStep(enText) {
  if (!enText || typeof enText !== "string") return "";
  const trimmed = enText.trim();
  if (!trimmed) return "";

  if (EXACT_STEP_TRANSLATIONS[trimmed]) {
    return EXACT_STEP_TRANSLATIONS[trimmed];
  }

  const lowerTrimmed = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(EXACT_STEP_TRANSLATIONS)) {
    if (key.toLowerCase() === lowerTrimmed) {
      return val;
    }
  }

  let translated = trimmed;
  for (const [regex, replacement] of CLAUSE_REPLACEMENTS) {
    translated = translated.replace(regex, replacement);
  }

  translated = translated
    .replace(/\bthe starting position\b/gi, "a posição inicial")
    .replace(/\bstarting position\b/gi, "posição inicial")
    .replace(/\bdumbbells\b/gi, "halteres")
    .replace(/\bdumbbell\b/gi, "halter")
    .replace(/\bbarbell\b/gi, "barra")
    .replace(/\bweight\b/gi, "peso")
    .replace(/\bupper chest\b/gi, "peitoral superior")
    .replace(/\bchest\b/gi, "peito")
    .replace(/\bshoulders\b/gi, "ombros")
    .replace(/\bshoulder\b/gi, "ombro")
    .replace(/\belbows\b/gi, "cotovelos")
    .replace(/\belbow\b/gi, "cotovelo")
    .replace(/\bknees\b/gi, "joelhos")
    .replace(/\bknee\b/gi, "joelho")
    .replace(/\bhips\b/gi, "quadris")
    .replace(/\bhip\b/gi, "quadril")
    .replace(/\bcore\b/gi, "abdômen")
    .replace(/\babs\b/gi, "abdômen")
    .replace(/\bhamstrings\b/gi, "posteriores de coxa")
    .replace(/\bquadriceps\b/gi, "quadríceps")
    .replace(/\bquads\b/gi, "quadríceps")
    .replace(/\bcalves\b/gi, "panturrilhas")
    .replace(/\bglutes\b/gi, "glúteos")
    .replace(/\bback\b/gi, "costas")
    .replace(/\btorso\b/gi, "tronco")
    .replace(/\bhands\b/gi, "mãos")
    .replace(/\bfeet\b/gi, "pés")
    .replace(/\bfloor\b/gi, "chão")
    .replace(/\bground\b/gi, "chão")
    .replace(/\bbench\b/gi, "banco")
    .replace(/\s+/g, " ")
    .trim();

  if (translated.length > 0) {
    translated = translated.charAt(0).toUpperCase() + translated.slice(1);
    if (!/[.!?]$/.test(translated)) {
      translated += ".";
    }
  }

  return translated;
}

export function translateStepsToPt(enSteps) {
  if (!enSteps) return [];

  let stepsArray = [];
  if (Array.isArray(enSteps)) {
    stepsArray = enSteps;
  } else if (typeof enSteps === "string") {
    const raw = enSteps.trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) stepsArray = parsed;
      } catch {
        stepsArray = raw.split(/\r?\n/);
      }
    } else {
      stepsArray = raw.split(/\r?\n/);
    }
  }

  const validEnSteps = stepsArray
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());

  if (validEnSteps.length === 0) return [];

  return validEnSteps.map((step) => translateSingleStep(step)).filter(Boolean);
}

export function getTargetExerciseIds(db) {
  if (!db) return [];

  const activeProgExerciseRows = db
    .prepare(
      "SELECT DISTINCT wde.exercise_id " +
      "FROM workout_day_exercises wde " +
      "JOIN workout_days wd ON wd.id = wde.workout_day_id " +
      "JOIN workout_programs wp ON wp.id = wd.program_id " +
      "WHERE wp.is_active = 1 AND wde.exercise_id IS NOT NULL"
    )
    .all();

  const topWorkSetExerciseRows = db
    .prepare(
      "SELECT wse.exercise_id, COUNT(wss.id) as work_sets_count " +
      "FROM workout_session_sets wss " +
      "JOIN workout_session_exercises wse ON wse.id = wss.session_exercise_id " +
      "WHERE (wss.set_role IS NULL OR wss.set_role != 'warmup') " +
      "  AND wse.exercise_id IS NOT NULL " +
      "GROUP BY wse.exercise_id " +
      "ORDER BY work_sets_count DESC " +
      "LIMIT 20"
    )
    .all();

  const idSet = new Set();
  for (const row of activeProgExerciseRows) {
    if (row?.exercise_id) idSet.add(row.exercise_id);
  }
  for (const row of topWorkSetExerciseRows) {
    if (row?.exercise_id) idSet.add(row.exercise_id);
  }

  return Array.from(idSet);
}

export async function translateExerciseInstructions(options = {}) {
  const isApply = Boolean(options.apply || options.dryRun === false);
  const dryRun = !isApply;
  const silent = Boolean(options.silent);

  let db = options.db;
  let closeDbOnExit = false;

  if (!db) {
    const Database = await getDatabaseClass();
    const resolvedPath = resolvePraxisDbPath(options.dbPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error("SQLite database not found at " + resolvedPath);
    }
    db = new Database(resolvedPath);
    closeDbOnExit = true;
  }

  try {
    const targetIds = Array.isArray(options.targetIds)
      ? options.targetIds
      : getTargetExerciseIds(db);

    const results = [];
    let translatedCount = 0;
    let skippedCount = 0;
    let alreadyHadPtCount = 0;
    let noEnCount = 0;

    const findStmt = db.prepare("SELECT * FROM workout_exercises WHERE id = ?");
    const updateStmt = db.prepare(
      "UPDATE workout_exercises SET instructions_json = ?, updated_at = datetime('now') WHERE id = ?"
    );

    const executeTranslation = () => {
      for (const exerciseId of targetIds) {
        const exercise = findStmt.get(exerciseId);
        if (!exercise) {
          skippedCount++;
          continue;
        }

        let parsed = null;
        if (exercise.instructions_json) {
          try {
            parsed =
              typeof exercise.instructions_json === "string"
                ? JSON.parse(exercise.instructions_json)
                : exercise.instructions_json;
          } catch {
            // invalid json
          }
        }

        const existingPt = Array.isArray(parsed?.pt)
          ? parsed.pt.filter((s) => typeof s === "string" && s.trim().length > 0)
          : [];

        if (existingPt.length > 0) {
          alreadyHadPtCount++;
          skippedCount++;
          results.push({
            id: exercise.id,
            name: exercise.name,
            source: exercise.source,
            status: "skipped_has_pt",
            ptCount: existingPt.length,
          });
          continue;
        }

        let enSteps = Array.isArray(parsed?.en)
          ? parsed.en.filter((s) => typeof s === "string" && s.trim().length > 0)
          : [];

        if (enSteps.length === 0 && exercise.instruction_steps) {
          try {
            const stepsObj =
              typeof exercise.instruction_steps === "string"
                ? JSON.parse(exercise.instruction_steps)
                : exercise.instruction_steps;
            if (Array.isArray(stepsObj?.en)) {
              enSteps = stepsObj.en.filter((s) => typeof s === "string" && s.trim().length > 0);
            } else if (Array.isArray(stepsObj)) {
              enSteps = stepsObj.filter((s) => typeof s === "string" && s.trim().length > 0);
            }
          } catch {
            // ignore
          }
        }

        if (enSteps.length === 0) {
          noEnCount++;
          skippedCount++;
          results.push({
            id: exercise.id,
            name: exercise.name,
            source: exercise.source,
            status: "skipped_no_en",
          });
          continue;
        }

        const ptSteps = translateStepsToPt(enSteps);
        if (ptSteps.length === 0) {
          skippedCount++;
          results.push({
            id: exercise.id,
            name: exercise.name,
            source: exercise.source,
            status: "skipped_translation_empty",
          });
          continue;
        }

        const newInstructionsJson = JSON.stringify({ en: enSteps, pt: ptSteps });

        if (!dryRun) {
          updateStmt.run(newInstructionsJson, exercise.id);
        }

        translatedCount++;
        results.push({
          id: exercise.id,
          name: exercise.name,
          source: exercise.source,
          status: "translated",
          enCount: enSteps.length,
          ptCount: ptSteps.length,
          previewPt: ptSteps[0],
        });
      }
    };

    if (!dryRun) {
      db.transaction(executeTranslation)();
    } else {
      executeTranslation();
    }

    const summary = {
      mode: dryRun ? "dry-run" : "applied",
      dryRun,
      totalSelected: targetIds.length,
      translatedCount,
      skippedCount,
      alreadyHadPtCount,
      noEnCount,
      results,
    };

    if (!silent) {
      console.log("\n=== Praxis Treinos V4 Fase 14 — Exercise Instructions PT Translation ===");
      console.log("Mode: " + (dryRun ? "DRY RUN (no changes written to DB)" : "APPLY (changes saved to SQLite)"));
      console.log("Total Target IDs Selected (Active Program Day + Top 20 Sets): " + targetIds.length);
      console.log("  - Translated to PT: " + translatedCount);
      console.log("  - Already had PT (preserved): " + alreadyHadPtCount);
      console.log("  - No EN steps (custom/untouched): " + noEnCount);
      console.log("  - Total Skipped: " + skippedCount);

      if (translatedCount > 0) {
        console.log("\nSample translations:");
        const sampleTranslated = results.filter((r) => r.status === "translated").slice(0, 5);
        for (const item of sampleTranslated) {
          console.log("  * [" + item.name + "] (" + item.ptCount + " passos): " + item.previewPt);
        }
      }
      console.log("=========================================================================\n");
    }

    return summary;
  } finally {
    if (closeDbOnExit && db) {
      db.close();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run") ? true : !apply;
  const silent = args.includes("--silent");
  const dbArg = args.find((a) => a.startsWith("--db="));
  const dbPath = dbArg ? dbArg.split("=")[1] : null;

  try {
    await translateExerciseInstructions({
      apply: !dryRun,
      dryRun,
      silent,
      dbPath,
    });
    process.exit(0);
  } catch (err) {
    console.error("Translation failed:", err);
    process.exit(1);
  }
}
