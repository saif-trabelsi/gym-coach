import type {
  ExerciseConfig,
  FrameMetricsInput,
  RepMetrics,
  RepResult,
  RepState,
  StateMachineUpdateResult,
} from './types';
import { evaluateRep } from './scoring';

export class RepStateMachine {
  private config: ExerciseConfig;
  private state: RepState = 'idle';
  private repStartTimeMs: number | null = null;
  private descentStartTimeMs: number | null = null;
  private descentDurationMs = 0;
  private minAngle = Infinity;
  private maxAngle = -Infinity;
  private minKneeAngle = Infinity;
  private maxTorsoLean = 0;
  private reachedTarget = false;
  private reps: RepResult[] = [];

  constructor(config: ExerciseConfig) {
    this.config = config;
  }

  /**
   * Updates state machine with the latest joint angle, timestamp, and frame metrics.
   *
   * @param angle Current joint angle in degrees
   * @param timestampMs Monotonic timestamp in milliseconds
   * @param frameMetrics Optional frame-by-frame metrics (e.g. torso lean angle)
   * @returns Current state and any completed rep emitted at this update
   */
  public update(
    angle: number,
    timestampMs: number,
    frameMetrics?: FrameMetricsInput
  ): StateMachineUpdateResult {
    const hysteresis = this.config.hysteresis ?? 5;
    const isHighToLow = this.config.direction === 'high-to-low';
    let completedRep: RepResult | null = null;

    // Track frame-level metrics during an active rep
    if (this.state !== 'idle') {
      this.minAngle = Math.min(this.minAngle, angle);
      this.maxAngle = Math.max(this.maxAngle, angle);
      this.minKneeAngle = Math.min(this.minKneeAngle, angle);
      if (frameMetrics?.torsoLean !== undefined) {
        this.maxTorsoLean = Math.max(this.maxTorsoLean, frameMetrics.torsoLean);
      }
    }

    if (isHighToLow) {
      // e.g. Squat: Starts at high angle (> upThreshold), descends to low (< downThreshold)
      const up = this.config.upThreshold;
      const down = this.config.downThreshold;

      switch (this.state) {
        case 'idle':
          // Start rep when angle drops below up threshold minus hysteresis
          if (angle < up - hysteresis) {
            this.state = 'descending';
            this.repStartTimeMs = timestampMs;
            this.descentStartTimeMs = timestampMs;
            this.descentDurationMs = 0;
            this.minAngle = angle;
            this.maxAngle = angle;
            this.minKneeAngle = angle;
            this.maxTorsoLean = frameMetrics?.torsoLean ?? 0;
            this.reachedTarget = false;
          }
          break;

        case 'descending':
          if (angle <= down) {
            this.state = 'bottom';
            this.reachedTarget = true;
            this.descentDurationMs =
              this.descentStartTimeMs !== null ? timestampMs - this.descentStartTimeMs : 0;
          } else if (angle >= up) {
            // Aborted rep: returned to start without reaching bottom threshold
            this.resetCurrentRep();
            this.state = 'idle';
          }
          break;

        case 'bottom':
          // Once rising above bottom threshold plus hysteresis, transition to ascending
          if (angle > down + hysteresis) {
            this.state = 'ascending';
          }
          break;

        case 'ascending':
          if (angle >= up) {
            // Reached top position: complete rep if criteria met
            const durationMs =
              this.repStartTimeMs !== null ? timestampMs - this.repStartTimeMs : 0;

            if (this.reachedTarget && durationMs >= this.config.minDurationMs) {
              const metrics: RepMetrics = {
                minKneeAngle: this.minKneeAngle,
                maxTorsoLean: this.maxTorsoLean,
                descentDurationMs: this.descentDurationMs,
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
              };

              const { violations, score } = evaluateRep(metrics, this.config.rules ?? []);

              completedRep = {
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
                timestamp: timestampMs,
                metrics,
                violations,
                score,
              };
              this.reps.push(completedRep);
            }

            this.resetCurrentRep();
            this.state = 'idle';
          } else if (angle <= down) {
            // Dropped back down to bottom before reaching top
            this.state = 'bottom';
          }
          break;
      }
    } else {
      // 'low-to-high': Starts at low angle (< downThreshold), ascends to high (> upThreshold)
      const up = this.config.upThreshold;
      const down = this.config.downThreshold;

      switch (this.state) {
        case 'idle':
          // Start rep when angle rises above down threshold plus hysteresis
          if (angle > down + hysteresis) {
            this.state = 'ascending';
            this.repStartTimeMs = timestampMs;
            this.descentStartTimeMs = timestampMs;
            this.descentDurationMs = 0;
            this.minAngle = angle;
            this.maxAngle = angle;
            this.minKneeAngle = angle;
            this.maxTorsoLean = frameMetrics?.torsoLean ?? 0;
            this.reachedTarget = false;
          }
          break;

        case 'ascending':
          if (angle >= up) {
            this.state = 'bottom'; // inflection point
            this.reachedTarget = true;
          } else if (angle <= down) {
            // Aborted rep: returned to bottom without reaching top threshold
            this.resetCurrentRep();
            this.state = 'idle';
          }
          break;

        case 'bottom':
          // Once dropping below up threshold minus hysteresis, transition to descending
          if (angle < up - hysteresis) {
            this.state = 'descending';
            this.descentStartTimeMs = timestampMs;
          }
          break;

        case 'descending':
          if (angle <= down) {
            // Returned to bottom: complete rep if criteria met
            const durationMs =
              this.repStartTimeMs !== null ? timestampMs - this.repStartTimeMs : 0;
            const descentDuration =
              this.descentStartTimeMs !== null ? timestampMs - this.descentStartTimeMs : 0;

            if (this.reachedTarget && durationMs >= this.config.minDurationMs) {
              const metrics: RepMetrics = {
                minKneeAngle: this.minKneeAngle,
                maxTorsoLean: this.maxTorsoLean,
                descentDurationMs: descentDuration,
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
              };

              const { violations, score } = evaluateRep(metrics, this.config.rules ?? []);

              completedRep = {
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
                timestamp: timestampMs,
                metrics,
                violations,
                score,
              };
              this.reps.push(completedRep);
            }

            this.resetCurrentRep();
            this.state = 'idle';
          } else if (angle >= up) {
            // Rose back up before reaching bottom
            this.state = 'bottom';
          }
          break;
      }
    }

    return {
      state: this.state,
      completedRep,
    };
  }

  private resetCurrentRep(): void {
    this.repStartTimeMs = null;
    this.descentStartTimeMs = null;
    this.descentDurationMs = 0;
    this.minAngle = Infinity;
    this.maxAngle = -Infinity;
    this.minKneeAngle = Infinity;
    this.maxTorsoLean = 0;
    this.reachedTarget = false;
  }

  public getState(): RepState {
    return this.state;
  }

  public getRepCount(): number {
    return this.reps.length;
  }

  public getReps(): RepResult[] {
    return [...this.reps];
  }

  public reset(): void {
    this.state = 'idle';
    this.reps = [];
    this.resetCurrentRep();
  }
}
