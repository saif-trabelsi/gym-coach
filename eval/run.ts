import fs from 'node:fs';
import path from 'node:path';
import { runClipThroughEngine, type LandmarkClip } from './runner';
import {
  evaluateClips,
  formatResultsMarkdown,
  type ClipGroundTruth,
} from './metrics';

function main() {
  const fixturesDir = path.resolve(process.cwd(), 'eval/fixtures');
  const labelsDir = path.resolve(fixturesDir, 'labels');

  if (!fs.existsSync(fixturesDir) || !fs.existsSync(labelsDir)) {
    console.error(`Fixtures or labels directory not found at: ${fixturesDir}`);
    process.exit(1);
  }

  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith('.json'));

  const evaluations: Array<{
    truth: ClipGroundTruth;
    prediction: ReturnType<typeof runClipThroughEngine>;
  }> = [];

  console.log(`Starting headless evaluation on ${fixtureFiles.length} fixture clips...\n`);

  for (const file of fixtureFiles) {
    const fixturePath = path.join(fixturesDir, file);
    const labelPath = path.join(labelsDir, file);

    if (!fs.existsSync(labelPath)) {
      console.warn(`Skipping ${file}: No matching label file in ${labelsDir}`);
      continue;
    }

    const clipData: LandmarkClip = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const truthData: ClipGroundTruth = JSON.parse(fs.readFileSync(labelPath, 'utf-8'));

    const prediction = runClipThroughEngine(clipData);

    console.log(
      `Clip: ${clipData.clip} (${clipData.exercise}) | True Reps: ${truthData.trueRepCount} | Pred Reps: ${prediction.predictedRepCount}`
    );

    evaluations.push({
      truth: truthData,
      prediction,
    });
  }

  const results = evaluateClips(evaluations);
  const markdown = formatResultsMarkdown(results);

  // Write outputs
  const resultsJsonPath = path.resolve(process.cwd(), 'eval/results.json');
  const resultsMdPath = path.resolve(process.cwd(), 'eval/results.md');

  fs.writeFileSync(resultsJsonPath, JSON.stringify(results, null, 2), 'utf-8');
  fs.writeFileSync(resultsMdPath, markdown, 'utf-8');

  console.log('\n--- Evaluation Summary ---');
  console.log(`Clips Evaluated: ${results.totalClips}`);
  console.log(`Rep Count MAE: ${results.repCountMae} reps`);
  console.log(`Exact Match Rate: ${(results.repCountExactMatchRate * 100).toFixed(1)}%`);
  console.log(`Macro F1 Score: ${results.macroF1}`);
  console.log(`\nOutputs saved:`);
  console.log(`- ${resultsJsonPath}`);
  console.log(`- ${resultsMdPath}`);
}

main();
