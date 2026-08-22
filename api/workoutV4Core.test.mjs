import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MUSCLES as API_MUSCLES,
  MUSCLE_LABEL_PT as API_MUSCLE_LABEL_PT,
  BODY_PART_LABEL_PT as API_BODY_PART_LABEL_PT,
  EQUIPMENT_LABEL_PT as API_EQUIPMENT_LABEL_PT,
  aliasMuscle as apiAliasMuscle,
  formatBodyPart as apiFormatBodyPart,
  formatEquipment as apiFormatEquipment,
  formatMuscleName as apiFormatMuscleName,
  extractInstructionSteps as apiExtractInstructionSteps,
  extractSecondaryMuscles as apiExtractSecondaryMuscles,
  CDN_IMG_BASE as API_CDN_IMG_BASE,
  CDN_GIF_BASE as API_CDN_GIF_BASE,
  MEDIA_ATTRIBUTION as API_MEDIA_ATTRIBUTION,
  thumbUrl as apiThumbUrl,
  gifUrl as apiGifUrl,
  isTreinosV4Enabled as apiIsTreinosV4Enabled,
} from './lib/workoutV4Core.js';

import {
  MUSCLES as FRONT_MUSCLES,
  MUSCLE_LABEL_PT as FRONT_MUSCLE_LABEL_PT,
  BODY_PART_LABEL_PT as FRONT_BODY_PART_LABEL_PT,
  EQUIPMENT_LABEL_PT as FRONT_EQUIPMENT_LABEL_PT,
  aliasMuscle as frontAliasMuscle,
  formatBodyPart as frontFormatBodyPart,
  formatEquipment as frontFormatEquipment,
  formatMuscleName as frontFormatMuscleName,
  extractInstructionSteps as frontExtractInstructionSteps,
  extractSecondaryMuscles as frontExtractSecondaryMuscles,
  CDN_IMG_BASE as FRONT_CDN_IMG_BASE,
  CDN_GIF_BASE as FRONT_CDN_GIF_BASE,
  MEDIA_ATTRIBUTION as FRONT_MEDIA_ATTRIBUTION,
  thumbUrl as frontThumbUrl,
  gifUrl as frontGifUrl,
  isTreinosV4Enabled as frontIsTreinosV4Enabled,
} from '../src/lib/workoutV4/index.js';
import { formatRestDuration } from '../src/lib/workouts.js';

describe('workoutV4Core — muscles & vocabulary', () => {
  test('exports exact 18 canonical muscles in head-to-toe order', () => {
    const expected = [
      'trapezius',
      'deltoids',
      'chest',
      'upper-back',
      'serratus',
      'biceps',
      'triceps',
      'forearm',
      'abs',
      'obliques',
      'lower-back',
      'gluteal',
      'quadriceps',
      'hamstring',
      'adductors',
      'hip-flexors',
      'calves',
      'tibialis',
    ];

    assert.equal(API_MUSCLES.length, 18);
    assert.deepEqual(API_MUSCLES, expected);
    assert.deepEqual(FRONT_MUSCLES, expected);
  });

  test('every canonical muscle has a non-empty Portuguese label', () => {
    for (const muscle of API_MUSCLES) {
      const apiLabel = API_MUSCLE_LABEL_PT[muscle];
      const frontLabel = FRONT_MUSCLE_LABEL_PT[muscle];
      assert.equal(typeof apiLabel, 'string');
      assert.ok(apiLabel.trim().length > 0, `Missing API label for ${muscle}`);
      assert.equal(apiLabel, frontLabel);
    }
  });

  test('aliasMuscle handles exact canonical IDs and case/trim variations', () => {
    for (const aliasFn of [apiAliasMuscle, frontAliasMuscle]) {
      assert.equal(aliasFn('chest'), 'chest');
      assert.equal(aliasFn('CHEST'), 'chest');
      assert.equal(aliasFn('  upper-back  '), 'upper-back');
      assert.equal(aliasFn('upper_back'), 'upper-back');
      assert.equal(aliasFn('upper back'), 'upper-back');
    }
  });

  test('aliasMuscle maps all common dataset target/secondary muscle spellings', () => {
    for (const aliasFn of [apiAliasMuscle, frontAliasMuscle]) {
      // Chest & variations
      assert.equal(aliasFn('pecs'), 'chest');
      assert.equal(aliasFn('pectorals'), 'chest');
      assert.equal(aliasFn('upper chest'), 'chest');

      // Shoulders / Deltoids
      assert.equal(aliasFn('delts'), 'deltoids');
      assert.equal(aliasFn('shoulders'), 'deltoids');
      assert.equal(aliasFn('rear deltoids'), 'deltoids');
      assert.equal(aliasFn('rotator cuff'), 'deltoids');

      // Back & Lats
      assert.equal(aliasFn('lats'), 'upper-back');
      assert.equal(aliasFn('latissimus dorsi'), 'upper-back');
      assert.equal(aliasFn('rhomboids'), 'upper-back');
      assert.equal(aliasFn('back'), 'upper-back');

      // Traps & Neck
      assert.equal(aliasFn('traps'), 'trapezius');
      assert.equal(aliasFn('trapezius'), 'trapezius');
      assert.equal(aliasFn('neck'), 'trapezius');
      assert.equal(aliasFn('levator scapulae'), 'trapezius');
      assert.equal(aliasFn('sternocleidomastoid'), 'trapezius');

      // Serratus
      assert.equal(aliasFn('serratus'), 'serratus');
      assert.equal(aliasFn('serratus anterior'), 'serratus');

      // Arms
      assert.equal(aliasFn('biceps'), 'biceps');
      assert.equal(aliasFn('brachialis'), 'biceps');
      assert.equal(aliasFn('triceps'), 'triceps');
      assert.equal(aliasFn('forearms'), 'forearm');
      assert.equal(aliasFn('forearm'), 'forearm');
      assert.equal(aliasFn('lower arms'), 'forearm');
      assert.equal(aliasFn('wrists'), 'forearm');
      assert.equal(aliasFn('wrist flexors'), 'forearm');
      assert.equal(aliasFn('wrist extensors'), 'forearm');
      assert.equal(aliasFn('grip muscles'), 'forearm');
      assert.equal(aliasFn('hands'), 'forearm');

      // Core / Abs / Obliques / Lower Back
      assert.equal(aliasFn('abs'), 'abs');
      assert.equal(aliasFn('abdominals'), 'abs');
      assert.equal(aliasFn('core'), 'abs');
      assert.equal(aliasFn('lower abs'), 'abs');
      assert.equal(aliasFn('waist'), 'abs');
      assert.equal(aliasFn('obliques'), 'obliques');
      assert.equal(aliasFn('lower back'), 'lower-back');
      assert.equal(aliasFn('spine'), 'lower-back');

      // Lower body
      assert.equal(aliasFn('glutes'), 'gluteal');
      assert.equal(aliasFn('gluteal'), 'gluteal');
      assert.equal(aliasFn('abductors'), 'gluteal');
      assert.equal(aliasFn('quads'), 'quadriceps');
      assert.equal(aliasFn('quadriceps'), 'quadriceps');
      assert.equal(aliasFn('hamstrings'), 'hamstring');
      assert.equal(aliasFn('hamstring'), 'hamstring');
      assert.equal(aliasFn('adductors'), 'adductors');
      assert.equal(aliasFn('groin'), 'adductors');
      assert.equal(aliasFn('inner thighs'), 'adductors');
      assert.equal(aliasFn('hip flexors'), 'hip-flexors');
      assert.equal(aliasFn('hip-flexors'), 'hip-flexors');
      assert.equal(aliasFn('calves'), 'calves');
      assert.equal(aliasFn('soleus'), 'calves');
      assert.equal(aliasFn('lower legs'), 'calves');
      assert.equal(aliasFn('ankles'), 'calves');
      assert.equal(aliasFn('ankle stabilizers'), 'calves');
      assert.equal(aliasFn('feet'), 'calves');
      assert.equal(aliasFn('tibialis'), 'tibialis');
      assert.equal(aliasFn('shins'), 'tibialis');
    }
  });

  test('aliasMuscle returns null for unknown or non-muscle terms', () => {
    for (const aliasFn of [apiAliasMuscle, frontAliasMuscle]) {
      assert.equal(aliasFn(null), null);
      assert.equal(aliasFn(undefined), null);
      assert.equal(aliasFn(''), null);
      assert.equal(aliasFn('   '), null);
      assert.equal(aliasFn('cardiovascular system'), null);
      assert.equal(aliasFn('cardio'), null);
      assert.equal(aliasFn('unknown_muscle_xyz'), null);
    }
  });
});

describe('workoutV4Core — media URLs & attribution', () => {
  test('constants define jsDelivr CDN bases and Gym visual attribution', () => {
    assert.equal(
      API_CDN_IMG_BASE,
      'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/',
    );
    assert.equal(
      API_CDN_GIF_BASE,
      'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/',
    );
    assert.equal(
      API_MEDIA_ATTRIBUTION,
      '© Gym visual — https://gymvisual.com/',
    );

    assert.equal(FRONT_CDN_IMG_BASE, API_CDN_IMG_BASE);
    assert.equal(FRONT_CDN_GIF_BASE, API_CDN_GIF_BASE);
    assert.equal(FRONT_MEDIA_ATTRIBUTION, API_MEDIA_ATTRIBUTION);
  });

  test('thumbUrl builds full CDN URL from exercise object or string path', () => {
    for (const thumbFn of [apiThumbUrl, frontThumbUrl]) {
      assert.equal(
        thumbFn({ thumb_path: 'images/0001-2gPfomN.jpg' }),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/0001-2gPfomN.jpg',
      );
      assert.equal(
        thumbFn({ image: 'images/0001-2gPfomN.jpg' }),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/0001-2gPfomN.jpg',
      );
      assert.equal(
        thumbFn({ thumb_path: '0001-2gPfomN.jpg' }),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/0001-2gPfomN.jpg',
      );
      assert.equal(
        thumbFn('images/0001-2gPfomN.jpg'),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/0001-2gPfomN.jpg',
      );
      assert.equal(
        thumbFn('/images/0001-2gPfomN.jpg'),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/0001-2gPfomN.jpg',
      );
      assert.equal(
        thumbFn('https://example.com/custom-thumb.jpg'),
        'https://example.com/custom-thumb.jpg',
      );
      assert.equal(thumbFn(null), null);
      assert.equal(thumbFn({}), null);
      assert.equal(thumbFn(''), null);
    }
  });

  test('gifUrl builds full CDN URL from exercise object or string path', () => {
    for (const gifFn of [apiGifUrl, frontGifUrl]) {
      assert.equal(
        gifFn({ gif_path: 'videos/0001-2gPfomN.gif' }),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/0001-2gPfomN.gif',
      );
      assert.equal(
        gifFn({ gif_url: 'videos/0001-2gPfomN.gif' }),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/0001-2gPfomN.gif',
      );
      assert.equal(
        gifFn({ gif_path: '0001-2gPfomN.gif' }),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/0001-2gPfomN.gif',
      );
      assert.equal(
        gifFn('videos/0001-2gPfomN.gif'),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/0001-2gPfomN.gif',
      );
      assert.equal(
        gifFn('/videos/0001-2gPfomN.gif'),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/0001-2gPfomN.gif',
      );
      assert.equal(
        gifFn('https://example.com/custom-video.gif'),
        'https://example.com/custom-video.gif',
      );
      assert.equal(gifFn(null), null);
      assert.equal(gifFn({}), null);
      assert.equal(gifFn(''), null);
    }
  });

  test('thumbUrl and gifUrl resolve session exercise snapshot objects correctly', () => {
    for (const [thumbFn, gifFn] of [
      [apiThumbUrl, apiGifUrl],
      [frontThumbUrl, frontGifUrl],
    ]) {
      const sessionExerciseCatalog = {
        id: 'session-ex-1',
        session_id: 'session-1',
        exercise_id: 'ex-catalog-1316',
        exercise_name_snapshot: 'barbell bent arm pullover',
        thumb_path: 'images/1316-j599l3T.jpg',
        gif_path: 'videos/1316-j599l3T.gif',
        attribution: '© Gym visual — https://gymvisual.com/',
        source: 'catalog',
      };

      assert.equal(
        thumbFn(sessionExerciseCatalog),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/1316-j599l3T.jpg',
      );
      assert.equal(
        gifFn(sessionExerciseCatalog),
        'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/1316-j599l3T.gif',
      );

      const sessionExerciseCustom = {
        id: 'session-ex-2',
        session_id: 'session-1',
        exercise_id: 'ex-custom-1',
        exercise_name_snapshot: 'Flexão Customizada',
        thumb_path: null,
        gif_path: null,
        attribution: null,
        source: 'custom',
      };

      assert.equal(thumbFn(sessionExerciseCustom), null);
      assert.equal(gifFn(sessionExerciseCustom), null);
    }
  });
});

describe('Treinos V4 Fase 4 — Biblioteca UI helpers & formatting', () => {
  test('formatBodyPart translates canonical and raw body parts to PT', () => {
    for (const fn of [apiFormatBodyPart, frontFormatBodyPart]) {
      assert.equal(fn('chest'), 'Peitoral');
      assert.equal(fn('back'), 'Costas');
      assert.equal(fn('upper arms'), 'Braços');
      assert.equal(fn('shoulders'), 'Ombros');
      assert.equal(fn('upper legs'), 'Pernas');
      assert.equal(fn('waist'), 'Abdômen');
      assert.equal(fn('lower legs'), 'Panturrilhas');
      assert.equal(fn('lower arms'), 'Antebraço');
      assert.equal(fn('cardio'), 'Cardio');
      assert.equal(fn(null), null);
      assert.equal(fn(''), null);
      assert.equal(fn('custom_part'), 'custom_part');
    }
  });

  test('formatEquipment translates equipment keys to PT', () => {
    for (const fn of [apiFormatEquipment, frontFormatEquipment]) {
      assert.equal(fn('body weight'), 'Peso corporal');
      assert.equal(fn('dumbbell'), 'Halteres');
      assert.equal(fn('barbell'), 'Barra');
      assert.equal(fn('cable'), 'Polia / Cabo');
      assert.equal(fn('leverage machine'), 'Máquina');
      assert.equal(fn('band'), 'Elástico');
      assert.equal(fn('smith machine'), 'Smith');
      assert.equal(fn('kettlebell'), 'Kettlebell');
      assert.equal(fn(null), null);
    }
  });

  test('formatMuscleName returns translated canonical PT name or raw string', () => {
    for (const fn of [apiFormatMuscleName, frontFormatMuscleName]) {
      assert.equal(fn('pectorals'), 'Peitoral');
      assert.equal(fn('lats'), 'Dorsal');
      assert.equal(fn('biceps'), 'Bíceps');
      assert.equal(fn('quads'), 'Quadríceps');
      assert.equal(fn('abs'), 'Abdômen');
      assert.equal(fn('delts'), 'Deltoides');
      assert.equal(fn(null), null);
    }
  });

  test('extractInstructionSteps handles EN/PT step arrays and string JSON', () => {
    for (const fn of [apiExtractInstructionSteps, frontExtractInstructionSteps]) {
      const enSteps = ['Lie flat on bench', 'Lower bar to mid chest', 'Press up to lock out'];
      assert.deepEqual(fn({ instructions_json: JSON.stringify({ en: enSteps }) }), enSteps);
      assert.deepEqual(fn({ instructions_json: { en: enSteps } }), enSteps);

      const ptSteps = ['Deite no banco', 'Desça a barra'];
      assert.deepEqual(fn({ instructions_json: { en: enSteps, pt: ptSteps } }), ptSteps);

      const arrayJson = ['Passo 1', 'Passo 2'];
      assert.deepEqual(fn({ instructions_json: JSON.stringify(arrayJson) }), arrayJson);

      const plainText = 'Passo 1\nPasso 2';
      assert.deepEqual(fn({ instructions: plainText }), ['Passo 1', 'Passo 2']);

      assert.deepEqual(fn(null), []);
      assert.deepEqual(fn({}), []);
    }
  });

  test('extractSecondaryMuscles parses JSON arrays, objects, and lists', () => {
    for (const fn of [apiExtractSecondaryMuscles, frontExtractSecondaryMuscles]) {
      assert.deepEqual(fn({ secondary_muscles_json: '["triceps", "deltoids"]' }), ['triceps', 'deltoids']);
      assert.deepEqual(fn({ secondary_muscles: ['triceps', 'deltoids'] }), ['triceps', 'deltoids']);
      assert.deepEqual(fn({ secondary_muscles_json: 'triceps, deltoids' }), ['triceps', 'deltoids']);
      assert.deepEqual(fn(null), []);
    }
  });
});

describe('workoutV4Core — feature flags & backward compatibility', () => {
  test('isTreinosV4Enabled evaluates boolean and string flags correctly', () => {
    assert.equal(apiIsTreinosV4Enabled({ VITE_TREINOS_V4: '1' }), true);
    assert.equal(apiIsTreinosV4Enabled({ VITE_TREINOS_V4: 'true' }), true);
    assert.equal(apiIsTreinosV4Enabled({ VITE_TREINOS_V4: true }), true);
    assert.equal(apiIsTreinosV4Enabled({ VITE_TREINOS_V4: '0' }), false);
    assert.equal(apiIsTreinosV4Enabled({ VITE_TREINOS_V4: 'false' }), false);
    assert.equal(apiIsTreinosV4Enabled({ VITE_TREINOS_V4: false }), false);
    assert.equal(apiIsTreinosV4Enabled({}), false);
    assert.equal(apiIsTreinosV4Enabled(undefined), false);

    // Front helper default unset is false
    assert.equal(frontIsTreinosV4Enabled(), false);
  });

  test('src/lib/workouts.js preserves legacy workout helpers alongside V4 path', () => {
    assert.equal(formatRestDuration(90), '1:30');
  });
});
