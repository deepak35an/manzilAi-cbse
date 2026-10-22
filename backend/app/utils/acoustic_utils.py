import parselmouth
import numpy as np
import logging

logger = logging.getLogger(__name__)

def pitch_confidence(p_std):
    # Confidence remains high in the 20-60 Hz range. Too high is erratic, too low is monotone.
    if p_std < 5: return 0.4
    if p_std > 80: return 0.5
    return 1.0 - (abs(p_std - 35) / 70.0)

def intensity_confidence(i_std):
    # Stable volume is more confident. High std (>8) is shaky.
    conf = 1.0 - (i_std / 10.0)
    return max(0.1, min(1.0, conf))

def pause_confidence(pause_ratio):
    # < 20% pauses is very confident. > 50% is hesitant.
    if pause_ratio < 0.2: return 1.0
    if pause_ratio > 0.6: return 0.1
    return 1.0 - (pause_ratio - 0.2) / 0.4

def speech_rate_confidence(rate):
    # Average rate is 3-5 syllables/sec. Too slow (<1) is unsure.
    if 2.5 <= rate <= 5.0: return 1.0
    if rate < 1.0: return 0.2
    return 0.6

def voice_break_confidence(breaks_per_sec):
    # More breaks = less confidence.
    return max(0.1, 1.0 - (breaks_per_sec * 1.5))

def extract_features(audio_path):
    """
    Extracts acoustic features from the audio using Parselmouth/Praat.
    """
    try:
        snd = parselmouth.Sound(audio_path)
        duration = snd.get_total_duration()
        
        # 1. Pitch
        pitch = snd.to_pitch()
        pitch_values = pitch.selected_array['frequency']
        pitch_voiced = pitch_values[pitch_values > 0]
        p_std = np.std(pitch_voiced) if len(pitch_voiced) > 1 else 0
        
        # 2. Intensity
        intensity = snd.to_intensity()
        i_std = np.std(intensity.values)
        
        # 3. Pauses and Rate (Syllable estimation)
        i_values = intensity.values.flatten()
        i_times = intensity.xs()
        i_avg = np.mean(i_values)
        
        # Simple local maxima finding: value > neighbors and value > (avg - 5dB)
        syll_count = 0
        for idx in range(1, len(i_values) - 1):
            if i_values[idx] > i_values[idx-1] and i_values[idx] > i_values[idx+1]:
                if i_values[idx] > (i_avg - 2): # Threshold for syllabic peak
                    syll_count += 1
        
        speech_rate = syll_count / duration if duration > 0 else 0
        
        # Pause Ratio
        # Filter voiced segments (where pitch > 0)
        voiced_frames = len(pitch_voiced)
        total_frames = len(pitch_values)
        pause_ratio = (total_frames - voiced_frames) / total_frames if total_frames > 0 else 1.0
        
        # 4. Voice Breaks
        breaks = 0
        in_voiced_region = False
        for val in pitch_values:
            if val > 0:
                in_voiced_region = True
            elif val == 0 and in_voiced_region:
                breaks += 1
                in_voiced_region = False
        breaks_per_sec = breaks / duration if duration > 0 else 0
        
        return {
            "pitch_std": float(p_std),
            "intensity_std": float(i_std),
            "pause_ratio": float(pause_ratio),
            "speech_rate": float(speech_rate),
            "breaks_per_sec": float(breaks_per_sec)
        }
    except Exception as e:
        logger.error(f"Error extracting features: {e}")
        return None

def calculate_acoustic_confidence(features):
    """
    Calculates acoustic confidence based on extracted features.
    """
    if features is None:
        return 0.5
        
    conf = (
        0.25 * pitch_confidence(features["pitch_std"]) +
        0.20 * intensity_confidence(features["intensity_std"]) +
        0.20 * pause_confidence(features["pause_ratio"]) +
        0.20 * speech_rate_confidence(features["speech_rate"]) +
        0.15 * voice_break_confidence(features["breaks_per_sec"])
    )
    return float(max(0.0, min(1.0, conf)))

def get_final_confidence(text_conf, audio_conf):
    """
    Combines text confidence (from Sarvam) and audio confidence (from Praat).
    """
    return 0.6 * text_conf + 0.4 * audio_conf
