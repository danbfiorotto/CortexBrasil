
import logging
import os

logger = logging.getLogger(__name__)

try:
    from faster_whisper import WhisperModel
    HAS_WHISPER = True
except ImportError:
    HAS_WHISPER = False
    logger.warning("⚠️ 'faster-whisper' library not found. Audio transcription will be disabled.")

class AudioTranscriber:
    def __init__(self, model_size="tiny", device="cpu", compute_type="int8"):
        """
        Initializes the Whisper model.
        """
        self.model = None
        if HAS_WHISPER:
            try:
                self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
                logger.info(f"Whisper model '{model_size}' loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Whisper model: {e}")
        else:
            logger.warning("AudioTranscriber initialized without Whisper model (missing dependency).")

    def transcribe(self, file_path: str) -> str:
        """
        Transcribes the given audio file to text.
        """
        if not HAS_WHISPER or not self.model:
            logger.error("Whisper model is not available.")
            return "Erro: Sistema de transcrição de áudio indisponível no momento."

        try:
            segments, info = self.model.transcribe(file_path, beam_size=5)
            logger.info(f"Detected language '{info.language}' with probability {info.language_probability}")

            text = " ".join([segment.text for segment in segments])
            return text.strip()
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return "Erro ao transcrever áudio."
