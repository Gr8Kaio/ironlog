import type { Equipment, KneeState, MuscleGroup, RunType, SetType, Surface } from '../db/types';

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  forearms: 'Forearms',
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
};

export const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: 'Warm-up',
  working: 'Working',
  amrap: 'AMRAP',
  dropset: 'Drop set',
};

export const RUN_TYPE_LABEL: Record<RunType, string> = {
  easy: 'Easy',
  tempo: 'Tempo',
  intervals: 'Intervals',
  long: 'Long run',
  race: 'Race',
};

/**
 * Short labels above are for chips and filters. Titles need their own map:
 * "Long run" plus a trailing "run" reads as "Long run run".
 */
export const RUN_TITLE: Record<RunType, string> = {
  easy: 'Easy run',
  tempo: 'Tempo run',
  intervals: 'Interval session',
  long: 'Long run',
  race: 'Race',
};

export const SURFACE_LABEL: Record<Surface, string> = {
  road: 'Road',
  trail: 'Trail',
  treadmill: 'Treadmill',
};

export const KNEE_LABEL: Record<KneeState, string> = {
  fine: 'Fine',
  niggle: 'Niggle',
  sore: 'Sore',
  bad: 'Bad',
};

/** Knee states earn a colour because that is the field worth spotting at a glance. */
export const KNEE_TONE: Record<KneeState, 'good' | 'gold' | 'neutral'> = {
  fine: 'good',
  niggle: 'gold',
  sore: 'gold',
  bad: 'neutral',
};

export const asOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
