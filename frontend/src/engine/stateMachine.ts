import type {
  ExerciseConfig,
  RepResult,
  RepState,
  StateMachineUpdateResult,
} from './types';

export class RepStateMachine {
  private config: ExerciseConfig;
  private state: RepState = 'idle';
  private repStartTimeMs: number | null = null;
  private minAngle = Infinity;
  private maxAngle = -Infinity;
  private reachedTarget = false;
  private reps: RepResult[] = [];

  constructor(config: ExerciseConfig) {
    this.config = config;
  }

  /**
   * Updates state machine with the latest joint angle and timestamp.
   *
   * @param angle Current joint angle in degrees
   * @param timestampMs Monotonic timestamp in milliseconds
   * @returns Current state and any completed rep emitted at this update
   */
  public update(angle: number, timestampMs: number): StateMachineUpdateResult {
    const hysteresis = this.config.hysteresis ?? 5;
    const isHighToLow = this.config.direction === 'high-to-low';
    let completedRep: RepResult | null = null;

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
            this.minAngle = angle;
            this.maxAngle = angle;
            this.reachedTarget = false;
          }
          break;

        case 'descending':
          this.minAngle = Math.min(this.minAngle, angle);
          this.maxAngle = Math.max(this.maxAngle, angle);

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
          this.minAngle = Math.min(this.minAngle, angle);
          this.maxAngle = Math.max(this.maxAngle, angle);

          // Once rising above bottom threshold plus hysteresis, transition to ascending
          if (angle > down + hysteresis) {
            this.state = 'ascending';
          }
          break;

        case 'ascending':
          this.minAngle = Math.min(this.minAngle, angle);
          this.maxAngle = Math.max(this.maxAngle, angle);

          if (angle >= up) {
            // Reached top position: complete rep if criteria met
            const durationMs =
              this.repStartTimeMs !== null ? timestampMs - this.repStartTimeMs : 0;

            if (this.reachedTarget && durationMs >= this.config.minDurationMs) {
              completedRep = {
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
                timestamp: timestampMs,
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
            this.minAngle = angle;
            this.maxAngle = angle;
            this.reachedTarget = false;
          }
          break;

        case 'ascending':
          this.minAngle = Math.min(this.minAngle, angle);
          this.maxAngle = Math.max(this.maxAngle, angle);

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
          this.minAngle = Math.min(this.minAngle, angle);
          this.maxAngle = Math.max(this.maxAngle, angle);

          // Once dropping below up threshold minus hysteresis, transition to descending
          if (angle < up - hysteresis) {
            this.state = 'descending';
          }
          break;

        case 'descending':
          this.minAngle = Math.min(this.minAngle, angle);
          this.maxAngle = Math.max(this.maxAngle, angle);

          if (angle <= down) {
            // Returned to bottom: complete rep if criteria met
            const durationMs =
              this.repStartTimeMs !== null ? timestampMs - this.repStartTimeMs : 0;

            if (this.reachedTarget && durationMs >= this.config.minDurationMs) {
              completedRep = {
                minAngle: this.minAngle,
                maxAngle: this.maxAngle,
                durationMs,
                timestamp: timestampMs,
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
    this.minAngle = Infinity;
    this.maxAngle = -Infinity;
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
