package com.desmond.gptwake;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import ai.picovoice.porcupine.PorcupineException;
import ai.picovoice.porcupine.PorcupineManager;

/**
 * Experimental local Portuguese wake-word detector.
 *
 * This class is intentionally NOT connected to WakeService yet. Running two
 * microphone capture loops simultaneously would cause audio ownership issues.
 * The caller must stop the existing GPTWake recognizer before start().
 *
 * Requires private AccessKey and custom Android .ppn / Portuguese .pv paths.
 * Never serialize the AccessKey, print it in logs, or publish model files
 * without checking their distribution terms.
 */
public final class PtBrWakeDetector {
    private final Context applicationContext;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private PorcupineManager manager;

    public PtBrWakeDetector(Context context) {
        this.applicationContext = context.getApplicationContext();
    }

    public synchronized boolean isRunning() {
        return manager != null;
    }

    public synchronized void start(String accessKey, String keywordPpnPath,
                                   String portuguesePvPath, Runnable onWakeWord)
            throws PorcupineException {
        if (manager != null) {
            throw new IllegalStateException("Detector already running");
        }
        if (accessKey == null || accessKey.isBlank()
                || keywordPpnPath == null || !keywordPpnPath.endsWith(".ppn")
                || portuguesePvPath == null || !portuguesePvPath.endsWith(".pv")
                || onWakeWord == null) {
            throw new IllegalArgumentException("Valid key, .ppn, .pv and callback required");
        }

        PorcupineManager created = new PorcupineManager.Builder()
                .setAccessKey(accessKey)
                .setKeywordPaths(new String[] {keywordPpnPath})
                .setModelPath(portuguesePvPath)
                .setSensitivities(new float[] {0.5f})
                .build(applicationContext, keywordIndex -> {
                    if (keywordIndex == 0) {
                        L.i("JEANWAKE_PT_BR_WAKE_DETECTED");
                        mainHandler.post(onWakeWord);
                    }
                });
        try {
            created.start();
            manager = created;
            L.i("JEANWAKE_PT_BR_LISTENING");
        } catch (PorcupineException error) {
            created.delete();
            throw error;
        }
    }

    public synchronized void stop() {
        PorcupineManager current = manager;
        manager = null;
        if (current != null) {
            try {
                current.stop();
            } catch (PorcupineException e) {
                L.e("JEANWAKE_PT_BR_STOP_ERROR", e);
            } finally {
                current.delete();
            }
            L.i("JEANWAKE_PT_BR_STOPPED");
        }
    }
}
