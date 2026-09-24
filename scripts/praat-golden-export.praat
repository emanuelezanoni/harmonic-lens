# Pinned-Praat golden exporter. CLI args: input WAV, output directory.
# --FULL-TRUST
# Emits plain TSV so native output and future WASM wrapper share comparison ABI.
# Analysis settings intentionally duplicate tests/praat-golden/manifest.json.

form Praat golden export
	sentence inputPath
	sentence outputDirectory
endform

input$ = inputPath$

sound = Read from file: input$
selectObject: sound
spectrogram = To Spectrogram: 0.005, 5000, 0.002, 20, "Hanning (sine-squared)"
matrix = To Matrix
selectObject: sound
pitch = To Pitch (raw autocorrelation): 0.01, 75, 600, 15, "no", 0.03, 0.45, 0.01, 0.35, 0.14
selectObject: sound
harmonicity = To Harmonicity (cc): 0.01, 75, 0.1, 1

spectrogramFile$ = outputDirectory$ + "/spectrogram.tsv"
selectObject: spectrogram
frames = Get number of frames
selectObject: matrix
bins = Get number of rows
writeFileLine: spectrogramFile$, "frame\ttime_seconds\tbin\tfrequency_hz\tpower"
for frame to frames
	selectObject: spectrogram
	time = Get time from frame number: frame
	selectObject: matrix
	for bin to bins
		frequency = (bin - 1) * 20
		power = Get value in cell: bin, frame
		appendFileLine: spectrogramFile$, frame, tab$, time, tab$, bin, tab$, frequency, tab$, power
	endfor
endfor

selectObject: pitch
pitchFile$ = outputDirectory$ + "/pitch.tsv"
frames = Get number of frames
writeFileLine: pitchFile$, "frame\ttime_seconds\thz"
for frame to frames
	time = Get time from frame number: frame
	hz = Get value in frame: frame, "Hertz"
	appendFileLine: pitchFile$, frame, tab$, time, tab$, hz
endfor

selectObject: harmonicity
harmonicityFile$ = outputDirectory$ + "/harmonicity.tsv"
frames = Get number of frames
writeFileLine: harmonicityFile$, "frame\ttime_seconds\tdb"
for frame to frames
	time = Get time from frame number: frame
	db = Get value in frame: frame
	appendFileLine: harmonicityFile$, frame, tab$, time, tab$, db
endfor

removeObject: sound, spectrogram, matrix, pitch, harmonicity
