/*
 * Harmonic Lens Praat spectrogram WASM probe wrapper.
 *
 * This file is GPL-2.0-or-later. It calls unmodified Praat v7.0.02,
 * commit 6f3da9ef1d8cce0d5684afc104d02888dfc71b25, specifically
 * fon/Sound.cpp and fon/Sound_and_Spectrogram.cpp. No Praat DSP is copied
 * or modified here. See docs/praat-wasm-probe.md.
 */

#include <cmath>
#include <cstdint>
#include <limits>

#include "Sound_and_Spectrogram.h"

extern "C" {

struct praat_audio_input_v1 {
	const float *samples;
	int32_t channel_count;
	int32_t sample_count;
	double sample_interval_seconds;
};

struct praat_spectrogram_meta_v1 {
	int32_t frame_count;
	int32_t bin_count;
	double first_time_seconds;
	double time_step_seconds;
	double first_frequency_hz;
	double frequency_step_hz;
};

// Status: 0 OK; 1 null; 2 invalid input; 3 output capacity; 4 Praat error;
// 5 unexpected exception. `samples` is planar, channel-major Float32 PCM.
int32_t praat_spectrogram_v1 (
	const praat_audio_input_v1 *input,
	double analysis_width_seconds,
	double max_frequency_hz,
	double min_time_step_seconds,
	double min_frequency_step_hz,
	int32_t window_shape,
	double *out_power,
	int32_t out_power_capacity,
	praat_spectrogram_meta_v1 *out_meta
) {
	if (! input || ! out_meta)
		return 1;
	if (! input -> samples || input -> channel_count < 1 || input -> sample_count < 1 ||
		! std::isfinite (input -> sample_interval_seconds) || input -> sample_interval_seconds <= 0.0 ||
		! std::isfinite (analysis_width_seconds) || analysis_width_seconds <= 0.0 ||
		! std::isfinite (max_frequency_hz) || ! std::isfinite (min_time_step_seconds) || min_time_step_seconds <= 0.0 ||
		! std::isfinite (min_frequency_step_hz) || min_frequency_step_hz <= 0.0 ||
		window_shape < 0 || window_shape > 5)
		return 2;
	try {
		auto sound = Sound_create (
			(integer) input -> channel_count, 0.0,
			input -> sample_count * input -> sample_interval_seconds,
			(integer) input -> sample_count, input -> sample_interval_seconds,
			0.5 * input -> sample_interval_seconds
		);
		for (integer channel = 1; channel <= sound -> ny; channel ++) {
			const int64_t offset = (int64_t) (channel - 1) * input -> sample_count;
			for (integer sample = 1; sample <= sound -> nx; sample ++) {
				const float value = input -> samples [offset + sample - 1];
				if (! std::isfinite (value))
					return 2;
				sound -> z [channel] [sample] = value;
			}
		}
		auto spectrogram = Sound_to_Spectrogram_e (
			sound.get(), analysis_width_seconds, max_frequency_hz,
			min_time_step_seconds, min_frequency_step_hz,
			(kSound_to_Spectrogram_windowShape) window_shape, 4.0, 4.0
		);
		const int64_t values = (int64_t) spectrogram -> nx * spectrogram -> ny;
		if (values > std::numeric_limits<int32_t>::max ())
			return 3;
		*out_meta = {
			(int32_t) spectrogram -> nx, (int32_t) spectrogram -> ny,
			spectrogram -> x1, spectrogram -> dx, spectrogram -> y1, spectrogram -> dy
		};
		if (! out_power || out_power_capacity < values)
			return 3;
		for (integer frame = 1; frame <= spectrogram -> nx; frame ++)
			for (integer bin = 1; bin <= spectrogram -> ny; bin ++)
				out_power [(frame - 1) * spectrogram -> ny + bin - 1] = spectrogram -> z [bin] [frame];
		return 0;
	} catch (MelderError) {
		Melder_clearError ();
		return 4;
	} catch (...) {
		return 5;
	}
}
} // extern "C"
