import type {
  CommonRepMetrics,
  ExerciseConfig,
  FrameMetricsInput,
  RepMetrics,
  RepMetricsCollector,
  RepResult,
  RepState,
  StateMachineUpdateResult,
} from './types';
import { evaluateRep } from './scoring';

export class RepStateMachine {
  private config: ExerciseConfig;
  private collector?: RepMetricsCollector;
  private state: RepState = 'idle';
  private repStartTimeMs: number | null = null;

  // Timestamps for accurate descent duration tracking
  private lastAboveUpTimestampMs: number | null = null;
  private lastBelowDownTimestampMs: number | null = null;
  private descentStartMs: number | null = null;
  private bottomMs: number | null = null;

  private minAngle = Infinity;
  private maxAngle = -Infinity;
  private minKneeAngle = Infinity;
  private maxTargetAngle = -Infinity;
  private maxTorsoLean = 0;
  private reachedTarget = false;
  private reps: RepResult[] = [];

  constructor(config: ExerciseConfig) {
    this.config = config;
    if (config.createMetricsCollector) {
      this.collector = config.createMetricsCollector();
    }
  }

  /**
   * Switches the active exercise configuration and resets rep counters and internal state.
   */
  public setConfig(config: ExerciseConfig): void {
    this.config = config;
    this.collector = config.createMetricsCollector ? config.createMetricsCollector() : undefined;
    this.reset();
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

    if (isHighToLow) {
      // Squat / Bicep Curl: Starts at high angle (> upThreshold), descends to low (< downThreshold)
      const up = this.config.upThreshold;
      const down = this.config.downThreshold;

      // Keep track of the last moment the joint angle was above the up threshold
      if (angle >= up) {
        this.lastAboveUpTimestampMs = timestampMs;
        this.collector?.onAboveUpThreshold?.(angle, timestampMs, frameMetrics);
      }

      // Track frame-level metrics and inflection point during an active rep
      if (this.state !== 'idle') {
        this.minAngle = Math.min(this.minAngle, angle);
        this.maxAngle = Math.max(this.maxAngle, angle);

        if (angle < this.minKneeAngle) {
          this.minKneeAngle = angle;
          this.bottomMs = timestampMs;
        }

        if (frameMetrics?.torsoLean !== undefined) {
          this.maxTorsoLean = Math.max(this.maxTorsoLean, frameMetrics.torsoLean);
        }

        this.collector?.onFrame?.(angle, timestampMs, this.state, frameMetrics);
      }

      switch (this.state) {
        case 'idle':
          // Start rep when angle drops below up threshold minus hysteresis
          if (angle < up - hysteresis) {
            this.state = 'descending';
            this.repStartTimeMs = timestampMs;
            // Descent starts at the last moment joint angle was above the up threshold
            this.descentStartMs = this.lastAboveUpTimestampMs ?? timestampMs;
            this.minAngle = angle;
            this.maxAngle = angle;
            this.minKneeAngle = angle;
            this.bottomMs = timestampMs;
            this.maxTorsoLean = frameMetrics?.torsoLean ?? 0;
            this.reachedTarget = false;

            this.collector?.onRepStart?.(angle, timestampMs, frameMetrics);
          }
          break;

        case 'descending':
          if (angle <= down) {
            this.state = 'bottom';
            this.reachedTarget = true;
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
              const descentStart = this.descentStartMs ?? this.repStartTimeMs ?? timestampMs;
              const bottom = this.bottomMs ?? timestampMs;
              const descentDurationMs = Math.max(0, bottom - descentStart);

              const commonMetrics: CommonRepMetrics = {
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
                descentDurationMs,
                descentStartMs: descentStart,
                bottomMs: bottom,
              };

              let metrics: RepMetrics;
              if (this.collector?.onRepCompleted) {
                metrics = this.collector.onRepCompleted(commonMetrics, frameMetrics);
              } else if (this.config.computeRepMetrics) {
                metrics = this.config.computeRepMetrics(commonMetrics);
              } else {
                metrics = {
                  minKneeAngle: this.minKneeAngle,
                  maxTorsoLean: this.maxTorsoLean,
                  descentDurationMs,
                  descentStartMs: descentStart,
                  bottomMs: bottom,
                  minAngle: this.minAngle,
                  maxAngle: this.maxAngle,
                  durationMs,
                };
              }

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
            this.lastAboveUpTimestampMs = timestampMs;
            this.collector?.onAboveUpThreshold?.(angle, timestampMs, frameMetrics);
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

      if (angle <= down) {
        this.lastBelowDownTimestampMs = timestampMs;
      }

      if (this.state !== 'idle') {
        this.minAngle = Math.min(this.minAngle, angle);
        this.maxAngle = Math.max(this.maxAngle, angle);

        if (angle > this.maxTargetAngle) {
          this.maxTargetAngle = angle;
          this.bottomMs = timestampMs;
        }

        if (frameMetrics?.torsoLean !== undefined) {
          this.maxTorsoLean = Math.max(this.maxTorsoLean, frameMetrics.torsoLean);
        }

        this.collector?.onFrame?.(angle, timestampMs, this.state, frameMetrics);
      }

      switch (this.state) {
        case 'idle':
          // Start rep when angle rises above down threshold plus hysteresis
          if (angle > down + hysteresis) {
            this.state = 'ascending';
            this.repStartTimeMs = timestampMs;
            this.descentStartMs = this.lastBelowDownTimestampMs ?? timestampMs;
            this.minAngle = angle;
            this.maxAngle = angle;
            this.minKneeAngle = angle;
            this.maxTargetAngle = angle;
            this.bottomMs = timestampMs;
            this.maxTorsoLean = frameMetrics?.torsoLean ?? 0;
            this.reachedTarget = false;

            this.collector?.onRepStart?.(angle, timestampMs, frameMetrics);
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
          }
          break;

        case 'descending':
          if (angle <= down) {
            // Returned to bottom: complete rep if criteria met
            const durationMs =
              this.repStartTimeMs !== null ? timestampMs - this.repStartTimeMs : 0;
            const descentStart = this.descentStartMs ?? this.repStartTimeMs ?? timestampMs;
            const bottom = this.bottomMs ?? timestampMs;
            const descentDurationMs = Math.max(0, bottom - descentStart);

            if (this.reachedTarget && durationMs >= this.config.minDurationMs) {
              const commonMetrics: CommonRepMetrics = {
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
                descentDurationMs,
                descentStartMs: descentStart,
                bottomMs: bottom,
              };

              let metrics: RepMetrics;
              if (this.collector?.onRepCompleted) {
                metrics = this.collector.onRepCompleted(commonMetrics, frameMetrics);
              } else if (this.config.computeRepMetrics) {
                metrics = this.config.computeRepMetrics(commonMetrics);
              } else {
                metrics = {
                  minKneeAngle: this.minKneeAngle,
                  maxTorsoLean: this.maxTorsoLean,
                  descentDurationMs,
                  descentStartMs: descentStart,
                  bottomMs: bottom,
                  minAngle: this.minAngle,
                  maxAngle: this.maxAngle,
                  durationMs,
                };
              }

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
            this.lastBelowDownTimestampMs = timestampMs;
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
    this.descentStartMs = null;
    this.bottomMs = null;
    this.minAngle = Infinity;
    this.maxAngle = -Infinity;
    this.minKneeAngle = Infinity;
    this.maxTargetAngle = -Infinity;
    this.maxTorsoLean = 0;
    this.reachedTarget = false;
    this.collector?.resetCurrentRep?.();
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
    this.lastAboveUpTimestampMs = null;
    this.lastBelowDownTimestampMs = null;
    this.collector?.reset?.();
    this.resetCurrentRep();
  }
}
