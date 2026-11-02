import { squatConfig } from './squat';
import { bicepCurlConfig } from './bicepCurl';
import type { ExerciseConfig } from '../types';

export { squatConfig, squatConfig as squat } from './squat';
export { bicepCurlConfig, bicepCurlConfig as bicepCurl } from './bicepCurl';

/**
 * Registry of available exercises keyed by identifier variants.
 */
export const exerciseRegistry: Record<string, ExerciseConfig> = {
  squat: squatConfig,
  bicepCurl: bicepCurlConfig,
  'bicep-curl': bicepCurlConfig,
  bicep_curl: bicepCurlConfig,
};

/**
 * Looks up an exercise configuration by its ID or name.
 */
export function getExerciseConfig(id: string): ExerciseConfig | undefined {
  return exerciseRegistry[id];
}
