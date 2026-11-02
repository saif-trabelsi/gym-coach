import type { SupportedLanguage } from './messages';

export class VoiceSynthesizer {
  private isAudioEnabled = false;
  private muted = false;
  private currentLanguage: SupportedLanguage = 'en-US';
  private onFallbackNotice?: (requestedLang: SupportedLanguage, fallbackLang: string) => void;

  private pendingSpeakTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    options: {
      muted?: boolean;
      language?: SupportedLanguage;
      onFallbackNotice?: (requestedLang: SupportedLanguage, fallbackLang: string) => void;
    } = {}
  ) {
    this.muted = options.muted ?? false;
    this.currentLanguage = options.language ?? 'en-US';
    this.onFallbackNotice = options.onFallbackNotice;

    // Preload voices if supported
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }

  /**
   * Unlocks speech synthesis playback after user interaction (browser autoplay policy).
   */
  public enableAudio(): void {
    this.isAudioEnabled = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  }

  public isEnabled(): boolean {
    return this.isAudioEnabled;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.cancel();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setLanguage(lang: SupportedLanguage): void {
    this.currentLanguage = lang;
  }

  public getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  public setFallbackCallback(
    cb: (requestedLang: SupportedLanguage, fallbackLang: string) => void
  ): void {
    this.onFallbackNotice = cb;
  }

  /**
   * Cancels active speech and speaks text in the configured language.
   * Resolves a known Chrome bug where cancel() immediately followed by speak()
   * drops the utterance by introducing a short delay when canceling.
   */
  public speak(text: string): void {
    if (!this.isAudioEnabled || this.muted) {
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis is not supported in this environment.');
      return;
    }

    if (this.pendingSpeakTimeout) {
      clearTimeout(this.pendingSpeakTimeout);
      this.pendingSpeakTimeout = null;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    // Map language prefix
    const langPrefix = this.currentLanguage.split('-')[0].toLowerCase();

    // Look for matching voice
    let selectedVoice = voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith(langPrefix) ||
        v.lang.toLowerCase().replace('_', '-').startsWith(this.currentLanguage.toLowerCase())
    );

    if (!selectedVoice && this.currentLanguage !== 'en-US') {
      // Voice not available for requested language -> fallback to English
      this.onFallbackNotice?.(this.currentLanguage, 'en-US');
      selectedVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
      utterance.lang = 'en-US';
    } else {
      utterance.lang = selectedVoice ? selectedVoice.lang : this.currentLanguage;
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const executeSpeak = () => {
      this.pendingSpeakTimeout = null;
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    };

    // If already speaking or pending, cancel first and wait 50ms to prevent Chrome dropping the utterance
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
      this.pendingSpeakTimeout = setTimeout(executeSpeak, 50);
    } else {
      executeSpeak();
    }
  }

  public cancel(): void {
    if (this.pendingSpeakTimeout) {
      clearTimeout(this.pendingSpeakTimeout);
      this.pendingSpeakTimeout = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}
