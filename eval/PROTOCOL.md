# AI Gym Coach Biomechanical Evaluation Protocol

## 1. Objective

This protocol outlines the scientific procedure for collecting, annotating, evaluating, and benchmarking real-time computer vision repetition counting and form fault detection in AI Gym Coach. The goal is to produce honest, reproducible, and verifiable performance metrics for squat and bicep curl coaching without compromising participant privacy.

---

## 2. Filming Setup & Hardware Guidelines

### 2.1 Camera Positioning
- **Perspective**: Pure sagittal plane profile view (perpendicular to subject movement, 90° ± 5°).
- **Squat Camera Height**: Hip / greater trochanter level (~80–90 cm off floor).
- **Bicep Curl Camera Height**: Mid-torso / elbow crease level (~100–110 cm off floor).
- **Distance**: 2.5 m to 3.5 m from subject, ensuring the entire body (head to toes) remains in frame throughout full range of motion with at least 15% clearance margins above head and below feet.
- **Orientation**: Landscape mode (16:9 or 4:3), locked exposure and autofocus.

### 2.2 Environment & Lighting
- **Illumination**: Even, diffuse frontal and 45° key lighting (minimum 500 lux).
- **Background**: High contrast against subject attire, clear of visual clutter, moving mirrors, or distracting background personnel.
- **Backlighting**: Avoid positioning subjects directly in front of bright exterior windows or direct overhead spotlights that cause glare or silhouette clipping.

### 2.3 Participants & Consent
- **Demographics**: Minimum 6 distinct participants with diverse heights (1.55 m – 1.95 m), body mass indices, limb ratios, and lifting experience (novice to advanced).
- **Informed Consent**: Explicit written consent obtained from all participants prior to recording.
- **Attire**: Contrast-fitted athletic wear (shorts, leggings, athletic tees/tanks) so joint landmarks (hip, knee, ankle, shoulder, elbow, wrist) remain clearly identifiable without fabric occlusion.

---

## 3. Movement Protocols & Form Fault Definitions

Each participant performs 10–15 sets per exercise, alternating between pristine reference sets and deliberate form faults.

### 3.1 Squat Form Protocols
1. **Pristine Reference Sets**: Hip crease passes below top of knee (knee flexion $\le 100^\circ$), torso upright ($\le 45^\circ$ forward lean), controlled tempo ($\ge 1.0$ s descent).
2. **Shallow Depth (`depth`)**: Deliberate quarter or half squats failing to reach parallel (knee angle $> 100^\circ$).
3. **Excessive Forward Lean (`back`)**: Excessive trunk flexion where torso angle exceeds $45^\circ$ from vertical.
4. **Fast Descent (`tempo`)**: Uncontrolled descent dropping into bottom in $< 1.0$ s without muscular tension.

### 3.2 Bicep Curl Form Protocols
1. **Pristine Reference Sets**: Full elbow extension at start ($\ge 150^\circ$), peak flexion curl ($\le 55^\circ$), locked elbow pivot, stationary torso.
2. **Incomplete Curl Range (`range`)**: Failing to curl above $55^\circ$ elbow flexion.
3. **Incomplete Extension (`extension`)**: Failing to fully extend arm back to $\ge 150^\circ$ at start/finish.
4. **Elbow Drift (`elbowDrift`)**: Upper arm shifting excessively forward/backward ($> 0.22$ normalized forearm displacement).
5. **Body Sway (`swing`)**: Torso momentum swinging to initiate curl ($> 0.15$ normalized torso displacement).

---

## 4. Annotation & Labeling Standard

Ground truth annotations are stored in `eval/labels/<clip>.json`:

```json
{
  "clip": "squat_participant01_set02",
  "exercise": "squat",
  "trueRepCount": 5,
  "reps": [
    { "repIndex": 1, "faults": [] },
    { "repIndex": 2, "faults": ["depth"] },
    { "repIndex": 3, "faults": [] },
    { "repIndex": 4, "faults": ["back"] },
    { "repIndex": 5, "faults": ["depth", "tempo"] }
  ]
}
```

### Annotation Rules:
- Rep count begins on first intentional movement in the concentric/eccentric direction and terminates when returned to starting equilibrium.
- A fault is annotated if certified human coaches observe the biomechanical deviation for that rep.

---

## 5. Dataset Split (Tuning vs Held-out Test)

The recorded dataset is partitioned into two disjoint subsets:
1. **Tuning Set (50%)**: Used for threshold exploration, sensitivity analysis, and debugging edge cases.
2. **Held-out Test Set (50%)**: Strictly evaluated without threshold modification to report unbiased generalization numbers.

---

## 6. Privacy & Artifact Storage

- **Zero Video Retention**: Raw RGB video files are never committed to git repositories or uploaded to remote cloud instances.
- **Landmark Coordinates**: Only MediaPipe 33-landmark coordinate streams ($x, y, z, \text{visibility}$) and metadata labels are saved and committed to version control.
