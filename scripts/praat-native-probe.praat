# Offline native Praat probe for Harmonic Lens.
# Source/provenance: praat/praat v7.0.02, 6f3da9ef1d8cce0d5684afc104d02888dfc71b25.
# Creates deterministic in-memory input; does not read mic, files, or network.

sound = Create Sound from formula: "harmonic-lens-probe", 1, 0, 1, 44100, "0.5 * sin (2 * pi * 220 * x)"

spectrogram = To Spectrogram: 0.005, 5000, 0.002, 0.02, "Hanning (sine-squared)"
spectrogramFrames = Get number of frames

selectObject: sound
pitch = To Pitch (raw autocorrelation): 0.01, 75, 600, 15, "no", 0.03, 0.45, 0.01, 0.35, 0.14
pitchFrames = Get number of frames
pitchHz = Get value in frame: 10, "Hertz"

writeInfoLine: "spectrogram frames=", spectrogramFrames, " pitch frames=", pitchFrames, " Hz(frame 10)=", pitchHz

removeObject: sound, spectrogram, pitch
