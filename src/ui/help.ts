export type HelpEntry = { title: string; body: string[]; steps?: string[] };

/** Texts behind every "?" button. Keys are the data-help values in index.html (a test keeps the two in sync). */
export const help: Record<string, HelpEntry> = {
  quickstart: {
    title: "How to use Harmonic Lens",
    body: ["It shows your voice as you make it: pitch (F0), the resonances of your vocal tract (formants F1-F3) and the harmonics. Sound is analysed on this computer and never recorded or played back."],
    steps: [
      "Choose your microphone and the Voice type that fits you (this matters, see the ? next to it).",
      "Press Start microphone and allow access if your system asks.",
      "Sing or say a sustained vowel (a, e, i, o, u) for about a second.",
      "On the vowel space, move your trail into the circle of the vowel you are aiming for: it turns green when you are close.",
      "Use Pause to freeze the picture, and the panels below to calibrate the level or export the session."
    ]
  },
  level: {
    title: "Input level",
    body: [
      "The bar shows how loud the microphone signal is. Without calibration the number is in dBFS: 0 is the digital maximum, so values are negative. When you speak, aim for roughly -30 to -12.",
      "If the bar often reaches the red end the signal may distort: move back from the microphone or lower the input gain in your system. If it barely moves, come closer.",
      "After calibration (Level calibration panel) the number is in dB SPL for this microphone."
    ]
  },
  microphone: {
    title: "Microphone",
    body: [
      "Which input to listen to. You can change it while listening and the app switches immediately.",
      "Names appear only after you have allowed microphone access once. Echo cancellation, noise suppression and automatic gain are switched off on purpose, because they alter the voice you want to measure."
    ]
  },
  voice: {
    title: "Voice type",
    body: [
      "Sets the highest formant frequency the analysis looks for, and the pitch range. It also scales the vowel targets. A wrong choice makes formants jump or merge, so pick the closest one:",
      "Low voice (up to 5000 Hz): typical adult male. Medium voice (up to 5500 Hz): typical adult female. High / child (up to 7000 Hz): children and very high voices.",
      "If F1-F3 look unstable, try the neighbouring setting."
    ]
  },
  range: {
    title: "Frequency range",
    body: ["How much of the frequency axis the spectrogram displays: 0-3, 0-5 or 0-8 kHz. It changes only what you see, not the measurement. F1-F3 of speech live below about 4 kHz, so 0-5 kHz is a good default."]
  },
  mode: {
    title: "Spectrogram type",
    body: [
      "Wideband (short window): sharp in time, shows the formants as bands of energy. Best for vowels.",
      "Narrowband (long window): sharp in frequency, separates the individual harmonics as horizontal lines. Best to see your pitch structure, with the Harmonic guides."
    ]
  },
  spectrogram: {
    title: "Reading the spectrogram",
    body: [
      "The newest sound enters on the right and the picture scrolls to the left (about 10 seconds are visible). Height is frequency, brightness is energy.",
      "White line: F0, the pitch. Red, green and blue lines: F1, F2 and F3. The strip below is the pitch contour on a logarithmic scale, so a musical interval has the same height everywhere.",
      "Lines appear only while your voice is periodic (a vowel or a sung note); whispers and consonants like s or f show energy but no lines."
    ]
  },
  formantLines: {
    title: "Formant lines",
    body: ["Shows or hides the red, green and blue F1-F3 lines on the spectrogram. The numbers in the Now card and the vowel space keep working either way."]
  },
  now: {
    title: "Now",
    body: [
      "F0: the pitch of your voice in hertz. HNR: harmonics-to-noise ratio in dB, how clean and periodic the voice is (a clear sung vowel is often 15-25 dB; breathy or noisy voices are lower).",
      "F1, F2, F3: the first three formants. Roughly, F1 rises as the mouth opens wider and F2 rises as the tongue moves forward (i has a high F2, u a low one).",
      "Numbers are smoothed over about 0.15 s and rounded to 5 Hz. When the voice stops, the last values stay for a moment, dimmed, so you can read them."
    ]
  },
  vowelSpace: {
    title: "Vowel space",
    body: [
      "The classic vowel chart: F2 runs from right to left and F1 from top to bottom, so i is top-left, u top-right and a at the bottom. Your last second of voice leaves a fading trail with a white dot for where you are now.",
      "The circles are indicative targets for the Italian vowels i, e, ɛ, a, ɔ, o, u, taken from typical adult values and scaled by the Voice type. The nearest circle turns green when you are inside it.",
      "They are averages, not a verdict: real speakers differ by 10-15%. Use them as a guide and trust the consistency of your own trail."
    ]
  },
  harmonics: {
    title: "Harmonic guides",
    body: [
      "A harmonic is a multiple of your pitch: H1 = F0, H2 = 2 x F0 and so on. Switching H1-H8 on draws a line at each of them over the scrolling spectrogram, so you can see whether the energy sits on the harmonics.",
      "The lines follow your pitch and only appear while a pitch is found. They are unrelated to the formant lines. In the table, Guide is where the harmonic should be and Measured peak is the strongest peak actually found near it.",
      "Tip: choose the narrowband spectrogram to see the harmonics clearly."
    ]
  },
  calibration: {
    title: "Level calibration",
    body: [
      "Turns the level from dBFS (relative to the digital maximum) into dB SPL (real sound pressure) for the microphone in use.",
      "Play a steady sound, read a sound level meter (a phone app is fine), type the value and press Calibrate. The app stores the offset for this microphone only. Use Reset to go back to dBFS.",
      "It is a convenient comparison between sessions, not a laboratory measurement."
    ]
  },
  export: {
    title: "Export session",
    body: ["Saves a CSV file with one row per analysis frame (about 100 per second): time, level, F0, HNR and F1-F4, plus the dB SPL column if you calibrated. It keeps up to the last 10 minutes since you pressed Start. Only measurements are saved, never audio."]
  },
  diagnostics: {
    title: "Diagnostics",
    body: [
      "Technical details, useful if something does not work.",
      "Permission: whether the system allowed the microphone. Selected / Actual input: the device you picked and the one really used. Capture: how many channels arrive (they are averaged to mono). Analysis frames/s: should be about 100. Audio to screen: delay between sound and picture, normally under 60 ms plus the analysis window."
    ]
  }
};
