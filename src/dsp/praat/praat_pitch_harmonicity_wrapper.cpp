/*
 * Harmonic Lens Praat pitch/HNR WASM wrapper.
 *
 * GPL-2.0-or-later. Calls unmodified Praat v7.0.02,
 * commit 6f3da9ef1d8cce0d5684afc104d02888dfc71b25. No Praat DSP copied or
 * modified. Upstream entry points: fon/Sound_to_Pitch.cpp and
 * fon/Sound_to_Harmonicity.cpp. See docs/praat-pitch-harmonicity-wasm.md.
 */

#include <cmath>
#include <cstdint>
#include <limits>

#include "Sound_to_Harmonicity.h"
#include "Sound_to_Pitch.h"

extern "C" {

struct praat_audio_input_v1 {
	const float *samples;
	int32_t channel_count;
	int32_t sample_count;
	double sample_interval_seconds;
};

struct praat_track_meta_v1 {
	int32_t frame_count;
	double first_time_seconds;
	double time_step_seconds;
};

// Status: 0 OK; 1 null; 2 invalid input; 3 output capacity; 4 Praat error;
// 5 unexpected exception. `samples` is planar, channel-major Float32 PCM.
static int32_t validate_and_create_sound (const praat_audio_input_v1 *input,
	autoSound *out_sound)
{
	if (! input || ! out_sound)
		return 1;
	if (! input -> samples || input -> channel_count < 1 || input -> sample_count < 1 ||
		! std::isfinite (input -> sample_interval_seconds) || input -> sample_interval_seconds <= 0.0)
		return 2;
	try {
		*out_sound = Sound_create ((integer) input -> channel_count, 0.0,
			input -> sample_count * input -> sample_interval_seconds,
			(integer) input -> sample_count, input -> sample_interval_seconds,
			0.5 * input -> sample_interval_seconds);
		for (integer channel = 1; channel <= (*out_sound) -> ny; channel ++) {
			const int64_t offset = (int64_t) (channel - 1) * input -> sample_count;
			for (integer sample = 1; sample <= (*out_sound) -> nx; sample ++) {
				const float value = input -> samples [offset + sample - 1];
				if (! std::isfinite (value)) return 2;
				(*out_sound) -> z [channel] [sample] = value;
			}
		}
		return 0;
	} catch (MelderError) { Melder_clearError (); return 4; }
	catch (...) { return 5; }
}

int32_t praat_pitch_raw_ac_v1 (const praat_audio_input_v1 *input,
	double time_step_seconds, double floor_hz, double ceiling_hz,
	int32_t max_candidates, int32_t very_accurate, double silence_threshold,
	double voicing_threshold, double octave_cost, double octave_jump_cost,
	double voiced_unvoiced_cost, double *out_hz, int32_t out_capacity,
	praat_track_meta_v1 *out_meta)
{
	if (! out_meta) return 1;
	if (! std::isfinite (time_step_seconds) || time_step_seconds <= 0.0 ||
		! std::isfinite (floor_hz) || floor_hz <= 0.0 || ! std::isfinite (ceiling_hz) ||
		ceiling_hz <= floor_hz || max_candidates < 2 || (very_accurate != 0 && very_accurate != 1) ||
		! std::isfinite (silence_threshold) || ! std::isfinite (voicing_threshold) ||
		! std::isfinite (octave_cost) || ! std::isfinite (octave_jump_cost) ||
		! std::isfinite (voiced_unvoiced_cost)) return 2;
	autoSound sound;
	const int32_t input_status = validate_and_create_sound (input, & sound);
	if (input_status) return input_status;
	try {
		autoPitch pitch = Sound_to_Pitch_rawAc (sound.get(), time_step_seconds, floor_hz, ceiling_hz,
			(integer) max_candidates, very_accurate != 0, silence_threshold, voicing_threshold,
			octave_cost, octave_jump_cost, voiced_unvoiced_cost);
		if (pitch -> nx > std::numeric_limits<int32_t>::max ()) return 3;
		*out_meta = { (int32_t) pitch -> nx, pitch -> x1, pitch -> dx };
		if (! out_hz || out_capacity < pitch -> nx) return 3;
		for (integer frame = 1; frame <= pitch -> nx; frame ++)
			out_hz [frame - 1] = pitch -> frames [frame]. candidates [1]. frequency;
		return 0;
	} catch (MelderError) { Melder_clearError (); return 4; }
	catch (...) { return 5; }
}

int32_t praat_harmonicity_cc_v1 (const praat_audio_input_v1 *input,
	double time_step_seconds, double minimum_pitch_hz, double silence_threshold,
	double periods_per_window, double *out_db, int32_t out_capacity,
	praat_track_meta_v1 *out_meta)
{
	if (! out_meta) return 1;
	if (! std::isfinite (time_step_seconds) || time_step_seconds <= 0.0 ||
		! std::isfinite (minimum_pitch_hz) || minimum_pitch_hz <= 0.0 ||
		! std::isfinite (silence_threshold) || ! std::isfinite (periods_per_window) || periods_per_window <= 0.0)
		return 2;
	autoSound sound;
	const int32_t input_status = validate_and_create_sound (input, & sound);
	if (input_status) return input_status;
	try {
		autoHarmonicity harmonicity = Sound_to_Harmonicity_cc (sound.get(), time_step_seconds,
			minimum_pitch_hz, silence_threshold, periods_per_window);
		if (harmonicity -> nx > std::numeric_limits<int32_t>::max ()) return 3;
		*out_meta = { (int32_t) harmonicity -> nx, harmonicity -> x1, harmonicity -> dx };
		if (! out_db || out_capacity < harmonicity -> nx) return 3;
		for (integer frame = 1; frame <= harmonicity -> nx; frame ++)
			out_db [frame - 1] = harmonicity -> z [1] [frame];
		return 0;
	} catch (MelderError) { Melder_clearError (); return 4; }
	catch (...) { return 5; }
}

} // extern "C"
