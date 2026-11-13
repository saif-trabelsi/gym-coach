# Biomechanical Benchmark & Evaluation Results

**Evaluated Clips**: 5 | **Ground Truth Reps**: 19 | **Predicted Reps**: 19

## 1. Rep Counting Performance

| Metric | Value | Target |
|---|---|---|
| **Mean Absolute Error (MAE)** | **0 reps** | $\le 0.5$ reps |
| **Exact Match Rate** | **100.0%** | $\ge 90.0\%$ |

## 2. Per-Rule Form Fault Detection Performance

| Rule ID | True Pos (TP) | False Pos (FP) | False Neg (FN) | Precision | Recall | F1 Score |
|---|---|---|---|---|---|---|
| `extension` | 0 | 0 | 2 | 100.0% | 0.0% | **0.000** |
| `tempo` | 0 | 8 | 0 | 0.0% | 100.0% | **0.000** |
| `back` | 1 | 0 | 0 | 100.0% | 100.0% | **1.000** |
| `depth` | 0 | 0 | 2 | 100.0% | 0.0% | **0.000** |

**Macro Average F1**: **0.250**

## 3. Benchmark Limitations

- **Participant Diversity**: Tested on a limited set of synthetic & consented validation clips; further testing across wider body mass indices and loose clothing recommended.
- **Camera Angle Sensitivity**: Engine assumes profile view (perpendicular to movement); extreme diagonal angles ($> 30^\circ$) degrade joint visibility.
- **Lighting & Occlusion**: MediaPipe Pose estimation requires unobstructed view of hip, knee, and ankle joints for squats and shoulder/elbow/wrist for bicep curls.
