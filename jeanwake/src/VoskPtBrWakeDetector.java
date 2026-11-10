package com.desmond.gptwake;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Offline Portuguese speech transcription used experimentally as a wake phrase detector.
 * Unlike an actual keyword spotter, Vosk requires more CPU, may trigger false positives,
 * and might fail to transcribe "ChatGPT" reliably. Keep a visible Stop control.
 */
public final class VoskPtBrWakeDetector implements RecognitionListener {
    private static final String EI_GPT_GRAMMAR =
            "[\"ei peter\", \"ei z peter\", \"ei de peter\", "
            + "\"ei gente peter\", \"[unk]\"]";
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable onWake;
    private final AtomicBoolean triggered = new AtomicBoolean(false);
    private Model model;
    private Recognizer recognizer;
    private SpeechService service;
    private volatile boolean active;
    private volatile long lastSpeechDiagnosticMs;

    public VoskPtBrWakeDetector(Context ctx, Runnable onWake) {
        this.context = ctx.getApplicationContext();
        this.onWake = onWake;
    }

    public synchronized boolean start() throws IOException {
        if (active) return true;
        if (!VoskPtBrAssets.isReady(context)) {
            throw new IOException("Vosk Portuguese model has not been prepared");
        }
        try {
            model = new Model(VoskPtBrAssets.modelDir(context).getAbsolutePath());
            recognizer = new Recognizer(model, 16000.0f, EI_GPT_GRAMMAR);
            service = new SpeechService(recognizer, 16000.0f);
            triggered.set(false);
            if (!service.startListening(this)) throw new IOException("Vosk recorder did not start");
            active = true;
            L.i("JEANWAKE_VOSK_PT_LISTENING");
            return true;
        } catch (Exception e) {
            release();
            if (e instanceof IOException) throw (IOException) e;
            throw new IOException("Vosk initialization failed", e);
        }
    }

    private void handle(String json, String field) {
        if (!active || triggered.get() || json == null) return;
        try {
            String hypothesis = new JSONObject(json).optString(field, "");
            if (!hypothesis.isBlank()) VoskDebugState.accept(hypothesis);
            if (!hypothesis.isBlank()) {
                // Only coarse activity metadata; do not log recognized user speech.
                long now = android.os.SystemClock.elapsedRealtime();
                if (now - lastSpeechDiagnosticMs > 20_000L) {
                    lastSpeechDiagnosticMs = now;
                    L.i("JEANWAKE_VOSK_SPEECH_RECEIVED field=" + field);
                }
            }
            if (WakePhraseMatcher.matches(hypothesis) && triggered.compareAndSet(false, true)) {
                L.i("JEANWAKE_VOSK_PT_WAKE_DETECTED");
                main.post(onWake);
            }
        } catch (Exception e) {
            L.i("JEANWAKE_VOSK_RESULT_PARSE_ERROR");
        }
    }

    @Override public void onResult(String hypothesis) {
        handle(hypothesis, "text");
    }

    @Override public void onPartialResult(String hypothesis) {
        handle(hypothesis, "partial");
    }

    @Override public void onFinalResult(String hypothesis) {
        handle(hypothesis, "text");
    }

    @Override public void onError(Exception e) {
        // Don't disclose raw speech content. The service handles stopping on error.
        L.e("JEANWAKE_VOSK_CAPTURE_ERROR", e);
    }

    @Override public void onTimeout() {
        L.i("JEANWAKE_VOSK_TIMEOUT");
    }

    public synchronized boolean isListening() {
        return active;
    }

    public synchronized void stop() {
        active = false;
        release();
        L.i("JEANWAKE_VOSK_PT_STOPPED");
    }

    private void release() {
        if (service != null) {
            try { service.cancel(); } catch (RuntimeException ignored) { }
            try { service.shutdown(); } catch (RuntimeException ignored) { }
            service = null;
        }
        if (recognizer != null) {
            recognizer.close();
            recognizer = null;
        }
        if (model != null) {
            model.close();
            model = null;
        }
    }
}
