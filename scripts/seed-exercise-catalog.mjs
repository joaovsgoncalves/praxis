#!/usr/bin/env node
/**
 * scripts/seed-exercise-catalog.mjs
 *
 * Praxis Treinos V4 Fase 2 — Seed Exercise Catalog Metadata (~1324 exercises).
 *
 * Imports/upserts exercise metadata from exercises-dataset into SQLite.
 * No binary GIFs/images are downloaded or stored in git.
 * Custom user exercises (source="custom" or is_custom=1) are NEVER deleted or overwritten.
 *
 * Database Resolution Order:
 * 1. CLI flag: --db=/path/to/db
 * 2. Environment variables: FORJA_DB, PRAXIS_DB_PATH, PRAXIS_DB
 * 3. Fallback: resolveDbPath(apiDir) resolving api/praxis.db (with forja.db cold-copy fallback)
 *
 * Flags:
 *   --dry-run      Default mode. Inspects source dataset, compares against DB, prints sample counts without mutating.
 *   --apply        Applies changes to the SQLite database within a single atomic transaction.
 *   --db=PATH      Explicit path to SQLite database.
 *   --source=PATH  Path or URL to exercises JSON (default: .agent-context/data/exercises.json).
 *   --silent       Suppress detailed table and sample logging.
 *   --limit=N      Process only the first N records (useful for quick diagnostics).
 *
 * Usage:
 *   node scripts/seed-exercise-catalog.mjs                 # Dry-run
 *   node scripts/seed-exercise-catalog.mjs --apply         # Apply to prod DB
 *   node scripts/seed-exercise-catalog.mjs --apply --db=api/test.db
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { randomUUID } from "crypto";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const apiDir = path.join(workspaceRoot, "api");

// Fallback dataset URL if local cache is absent
const REMOTE_DATASET_URL = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json";
const LOCAL_CACHE_PATH = path.join(workspaceRoot, ".agent-context", "data", "exercises.json");

// Media attribution constant (isomorphic with api/lib/workoutV4Core.js)
export const MEDIA_ATTRIBUTION = "© Gym visual — https://gymvisual.com/";

export const WORKOUT_EXERCISE_CATEGORIES = [
  "strength",
  "calisthenics",
  "skill",
  "cardio",
  "mobility",
  "other",
];

export const WORKOUT_TRACKING_TYPES = [
  "reps",
  "weight_reps",
  "duration",
  "distance",
  "distance_duration",
];

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
 * Resolve DB path matching api/server.js and scripts/praxis-backup.sh.
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
      return targetPath;
    } catch {
      return legacyPath;
    }
  }

  return targetPath;
}

/**
 * Extract or parse media_id from dataset item or media filename.
 */
export function extractMediaId(item) {
  if (item?.media_id && typeof item.media_id === "string" && item.media_id.trim()) {
    return item.media_id.trim();
  }
  const candidate = item?.image || item?.thumb_path || item?.gif_url || item?.gif_path || "";
  const match = String(candidate).match(/[-_]([A-Za-z0-9]+)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

/**
 * Normalize instruction steps and paragraph text.
 */
export function parseInstructions(item) {
  let enSteps = [];
  let ptSteps = [];

  if (item.instructions_json) {
    if (typeof item.instructions_json === "string") {
      try {
        const parsed = JSON.parse(item.instructions_json);
        if (parsed && typeof parsed === "object") {
          enSteps = Array.isArray(parsed.en) ? parsed.en.filter(Boolean) : [];
          ptSteps = Array.isArray(parsed.pt) ? parsed.pt.filter(Boolean) : [];
        }
      } catch {
        // invalid json, ignore
      }
    } else if (typeof item.instructions_json === "object") {
      enSteps = Array.isArray(item.instructions_json.en) ? item.instructions_json.en.filter(Boolean) : [];
      ptSteps = Array.isArray(item.instructions_json.pt) ? item.instructions_json.pt.filter(Boolean) : [];
    }
  } else if (item.instruction_steps) {
    if (Array.isArray(item.instruction_steps)) {
      enSteps = item.instruction_steps.filter(Boolean);
    } else if (typeof item.instruction_steps === "object") {
      enSteps = Array.isArray(item.instruction_steps.en) ? item.instruction_steps.en.filter(Boolean) : [];
      ptSteps = Array.isArray(item.instruction_steps.pt) ? item.instruction_steps.pt.filter(Boolean) : [];
    }
  }

  let instructionsText = "";
  if (typeof item.instructions === "string") {
    instructionsText = item.instructions.trim();
  } else if (item.instructions && typeof item.instructions === "object" && typeof item.instructions.en === "string") {
    instructionsText = item.instructions.en.trim();
  } else if (enSteps.length > 0) {
    instructionsText = enSteps.join(" ");
  }

  return {
    instructions_json: JSON.stringify({ en: enSteps, pt: ptSteps }),
    instructions: instructionsText,
  };
}

/**
 * Normalize category string to valid WORKOUT_EXERCISE_CATEGORIES.
 */
export function mapExerciseCategory(item) {
  const rawCat = (item?.category || "").trim().toLowerCase();
  const rawBodyPart = (item?.body_part || "").trim().toLowerCase();
  const rawEquip = (item?.equipment || "").trim().toLowerCase();

  if (WORKOUT_EXERCISE_CATEGORIES.includes(rawCat)) {
    return rawCat;
  }

  const isCardio =
    rawCat === "cardio" ||
    rawBodyPart === "cardio" ||
    rawEquip === "stationary bike" ||
    rawEquip === "elliptical machine" ||
    rawEquip === "stepmill machine" ||
    rawEquip === "skierg machine" ||
    rawEquip === "upper body ergometer";

  if (isCardio) return "cardio";
  if (rawEquip === "body weight") return "calisthenics";
  if (rawCat === "mobility" || rawCat === "stretching" || rawCat === "flexibility") return "mobility";
  if (rawCat === "skill" || rawCat === "plyometrics") return "skill";

  return "strength";
}

/**
 * Determine tracking type heuristic.
 */
export function mapTrackingType(item, category) {
  if (item?.tracking_type && WORKOUT_TRACKING_TYPES.includes(item.tracking_type)) {
    return item.tracking_type;
  }

  if (category === "cardio") return "duration";

  const rawEquip = (item?.equipment || "").trim().toLowerCase();
  if (rawEquip === "body weight") {
    const rawName = (item?.name || "").toLowerCase();
    if (rawName.includes("plank") || rawName.includes("hold") || rawName.includes("hang") || rawName.includes("wall sit")) {
      return "duration";
    }
    return "reps";
  }

  return "weight_reps";
}

/**
 * Pure function to map a dataset item to DB columns.
 */
export function mapCatalogExercise(item) {
  if (!item || typeof item !== "object") {
    throw new Error("Invalid exercise item");
  }

  const rawId = item.id !== undefined && item.id !== null ? String(item.id).trim() : "";
  if (!rawId) {
    throw new Error("Exercise item missing required id");
  }
  const catalogExternalId = /^\d+$/.test(rawId) ? rawId.padStart(4, "0") : rawId;

  const name = String(item.name || "").trim();
  if (!name) {
    throw new Error("Exercise " + catalogExternalId + " missing required name");
  }

  const category = mapExerciseCategory(item);
  const trackingType = mapTrackingType(item, category);
  const bodyPart = item.body_part ? String(item.body_part).trim().toLowerCase() : null;
  const targetMuscle = item.target ? String(item.target).trim().toLowerCase() : (item.target_muscle ? String(item.target_muscle).trim().toLowerCase() : null);
  const muscleGroup = String(item.muscle_group || targetMuscle || bodyPart || "").trim();

  const rawEquipment = item.equipment ? String(item.equipment).trim() : "";
  const equipmentKey = rawEquipment
    ? rawEquipment.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    : null;

  let secondaryMuscles = [];
  if (Array.isArray(item.secondary_muscles)) {
    secondaryMuscles = item.secondary_muscles.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  } else if (Array.isArray(item.secondary_muscles_json)) {
    secondaryMuscles = item.secondary_muscles_json.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  } else if (typeof item.secondary_muscles_json === "string") {
    try {
      const parsed = JSON.parse(item.secondary_muscles_json);
      if (Array.isArray(parsed)) secondaryMuscles = parsed.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
    } catch {
      // ignore
    }
  }

  const thumbPath = item.thumb_path || item.image || (item.media_id ? ("images/" + catalogExternalId + "-" + item.media_id + ".jpg") : null);
  const gifPath = item.gif_path || item.gif_url || (item.media_id ? ("videos/" + catalogExternalId + "-" + item.media_id + ".gif") : null);
  const mediaId = extractMediaId(item);
  const attribution = (item.attribution && String(item.attribution).trim()) || MEDIA_ATTRIBUTION;
  const { instructions_json, instructions } = parseInstructions(item);

  const isBodyweight =
    rawEquipment.toLowerCase() === "body weight" ||
    item.is_bodyweight_default === 1 ||
    item.is_bodyweight_default === true ||
    item.is_bodyweight_default === "1";

  return {
    catalog_external_id: catalogExternalId,
    name,
    category,
    muscle_group: muscleGroup,
    equipment: rawEquipment,
    equipment_key: equipmentKey,
    tracking_type: trackingType,
    instructions,
    instructions_json,
    body_part: bodyPart,
    target_muscle: targetMuscle,
    secondary_muscles_json: JSON.stringify(secondaryMuscles),
    media_id: mediaId,
    thumb_path: thumbPath,
    gif_path: gifPath,
    attribution,
    is_bodyweight_default: isBodyweight ? 1 : 0,
    source: "catalog",
    is_custom: 0,
    status: "active",
  };
}

/**
 * Load dataset array from local file path or remote URL.
 */
export async function loadExerciseDataset(sourcePathOrUrl = null) {
  const resolvedSource = sourcePathOrUrl || (fs.existsSync(LOCAL_CACHE_PATH) ? LOCAL_CACHE_PATH : REMOTE_DATASET_URL);

  if (/^https?:\/\//i.test(resolvedSource)) {
    const response = await fetch(resolvedSource);
    if (!response.ok) {
      throw new Error("Failed to fetch exercises dataset from " + resolvedSource + ": HTTP " + response.status);
    }
    return await response.json();
  }

  const absPath = path.isAbsolute(resolvedSource) ? resolvedSource : path.resolve(process.cwd(), resolvedSource);
  if (!fs.existsSync(absPath)) {
    throw new Error("Exercise dataset file not found at " + absPath);
  }
  const content = fs.readFileSync(absPath, "utf8");
  return JSON.parse(content);
}

/**
 * Execute seed/upsert into SQLite database.
 */
export function seedExerciseCatalog({
  db,
  dataset,
  apply = false,
  dryRun = true,
  limit = null,
}) {
  if (!db) throw new Error("A valid better-sqlite3 database instance is required");
  if (!Array.isArray(dataset)) throw new Error("Dataset must be an array of exercise objects");

  const { initWorkoutSchema } = createRequire(path.join(apiDir, "server.js"))("./workouts.js");
  initWorkoutSchema(db);

  const effectiveApply = Boolean(apply && !dryRun);
  const recordsToProcess = limit ? dataset.slice(0, limit) : dataset;

  // Inspect pre-existing state
  const existingCatalogRows = db.prepare("SELECT id, catalog_external_id, name, updated_at FROM workout_exercises WHERE catalog_external_id IS NOT NULL").all();
  const catalogMap = new Map(existingCatalogRows.map((r) => [r.catalog_external_id, r]));

  const customRowsCount = db.prepare("SELECT COUNT(*) AS count FROM workout_exercises WHERE is_custom = 1 OR source = 'custom'").get()?.count || 0;

  const insertStmt = db.prepare("INSERT INTO workout_exercises (id, name, category, muscle_group, equipment, tracking_type, instructions, is_custom, catalog_external_id, source, body_part, target_muscle, secondary_muscles_json, media_id, thumb_path, gif_path, attribution, instructions_json, equipment_key, is_bodyweight_default, status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'catalog', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')");

  const updateStmt = db.prepare("UPDATE workout_exercises SET name = ?, category = ?, muscle_group = ?, equipment = ?, tracking_type = ?, instructions = ?, is_custom = 0, source = 'catalog', body_part = ?, target_muscle = ?, secondary_muscles_json = ?, media_id = ?, thumb_path = ?, gif_path = ?, attribution = ?, instructions_json = ?, equipment_key = ?, is_bodyweight_default = ?, status = 'active', updated_at = datetime('now') WHERE catalog_external_id = ?");

  let wouldInsert = 0;
  let wouldUpdate = 0;
  let inserted = 0;
  let updated = 0;
  const sampleRecords = [];

  const operations = [];

  for (const rawItem of recordsToProcess) {
    const mapped = mapCatalogExercise(rawItem);
    const existing = catalogMap.get(mapped.catalog_external_id);

    if (existing) {
      wouldUpdate += 1;
      operations.push({ type: "update", data: mapped, existingId: existing.id });
    } else {
      wouldInsert += 1;
      operations.push({ type: "insert", data: mapped, newId: randomUUID() });
    }

    if (sampleRecords.length < 5) {
      sampleRecords.push({
        id: mapped.catalog_external_id,
        name: mapped.name,
        category: mapped.category,
        body_part: mapped.body_part,
        target_muscle: mapped.target_muscle,
        equipment: mapped.equipment,
        action: existing ? "update" : "insert",
      });
    }
  }

  if (effectiveApply) {
    const runTx = db.transaction(() => {
      for (const op of operations) {
        const d = op.data;
        if (op.type === "insert") {
          insertStmt.run(
            op.newId,
            d.name,
            d.category,
            d.muscle_group,
            d.equipment,
            d.tracking_type,
            d.instructions,
            d.catalog_external_id,
            d.body_part,
            d.target_muscle,
            d.secondary_muscles_json,
            d.media_id,
            d.thumb_path,
            d.gif_path,
            d.attribution,
            d.instructions_json,
            d.equipment_key,
            d.is_bodyweight_default,
          );
          inserted += 1;
        } else if (op.type === "update") {
          updateStmt.run(
            d.name,
            d.category,
            d.muscle_group,
            d.equipment,
            d.tracking_type,
            d.instructions,
            d.body_part,
            d.target_muscle,
            d.secondary_muscles_json,
            d.media_id,
            d.thumb_path,
            d.gif_path,
            d.attribution,
            d.instructions_json,
            d.equipment_key,
            d.is_bodyweight_default,
            d.catalog_external_id,
          );
          updated += 1;
        }
      }
    });
    runTx();
  }

  const finalCatalogCount = db.prepare("SELECT COUNT(*) AS count FROM workout_exercises WHERE catalog_external_id IS NOT NULL").get()?.count || 0;
  const finalCustomCount = db.prepare("SELECT COUNT(*) AS count FROM workout_exercises WHERE is_custom = 1 OR source = 'custom'").get()?.count || 0;
  const finalTotalCount = db.prepare("SELECT COUNT(*) AS count FROM workout_exercises").get()?.count || 0;

  return {
    dryRun: !effectiveApply,
    totalInSource: dataset.length,
    processedCount: recordsToProcess.length,
    wouldInsert,
    wouldUpdate,
    inserted,
    updated,
    customPreserved: finalCustomCount,
    initialCustomCount: customRowsCount,
    catalogCountInDb: finalCatalogCount,
    totalInDb: finalTotalCount,
    sampleRecords,
  };
}

/**
 * Main CLI execution
 */
async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isDryRun = args.includes("--dry-run") || !isApply;
  const isSilent = args.includes("--silent");

  const dbArg = args.find((a) => a.startsWith("--db="));
  const customDbPath = dbArg ? dbArg.split("=")[1] : (args.indexOf("--db") !== -1 ? args[args.indexOf("--db") + 1] : null);

  const sourceArg = args.find((a) => a.startsWith("--source=") || a.startsWith("--file="));
  const customSource = sourceArg ? sourceArg.split("=")[1] : null;

  const limitArg = args.find((a) => a.startsWith("--limit=") || a.startsWith("--sample="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

  const dbPath = resolvePraxisDbPath(customDbPath);
  const Database = await getDatabaseClass();
  const db = new Database(dbPath);

  if (!isSilent) {
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("  Praxis Treinos V4 — Exercise Catalog Seed [" + (isApply ? "APPLY" : "DRY-RUN") + "]");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("  Target Database: " + dbPath);
    console.log("  Source Dataset:  " + (customSource || LOCAL_CACHE_PATH));
  }

  const dataset = await loadExerciseDataset(customSource);
  if (!isSilent) {
    console.log("  Dataset Records: " + dataset.length + " loaded");
    console.log("───────────────────────────────────────────────────────────────────");
  }

  const result = seedExerciseCatalog({
    db,
    dataset,
    apply: isApply,
    dryRun: isDryRun,
    limit,
  });

  if (!isSilent) {
    if (result.dryRun) {
      console.log("  Mode:            DRY-RUN (Simulated, no changes written to DB)");
      console.log("  Would Insert:    " + result.wouldInsert + " catalog exercises");
      console.log("  Would Update:    " + result.wouldUpdate + " existing catalog exercises");
    } else {
      console.log("  Mode:            APPLY (Committed to SQLite DB)");
      console.log("  Inserted:        " + result.inserted + " catalog exercises");
      console.log("  Updated:         " + result.updated + " catalog exercises");
    }
    console.log("  Custom Preserved: " + result.customPreserved + " user exercises intact (source=custom)");
    console.log("  Total in DB:     " + result.totalInDb + " exercises total (" + result.catalogCountInDb + " catalog + " + result.customPreserved + " custom)");
    console.log("───────────────────────────────────────────────────────────────────");
    console.log("  Sample Exercises:");
    for (const s of result.sampleRecords) {
      console.log("    [" + s.id + "] " + s.name.padEnd(30) + " | " + (s.category || "").padEnd(12) + " | " + (s.target_muscle || "").padEnd(12) + " | action: " + s.action);
    }
    console.log("═══════════════════════════════════════════════════════════════════");
    if (result.dryRun) {
      console.log("  To apply these changes to the database, run:");
      console.log("    node scripts/seed-exercise-catalog.mjs --apply");
      console.log("═══════════════════════════════════════════════════════════════════");
    }
  }

  db.close();
  return result;
}

// Auto-run if executed as main script
const isMain = process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error("Seed exercise catalog error:", err);
    process.exit(1);
  });
}
