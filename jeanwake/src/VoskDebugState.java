package com.desmond.gptwake;

import android.os.SystemClock;

/**
 * Opt-in, in-memory-only local diagnostic for the Vosk recognizer.
 *
 * Never writes speech text to logcat, SharedPreferences, disk, or a server.
 * Starts disabled on every process start, and holds at most one short hypothesis
 * for 30 seconds. The user explicitly turns it on from the JeanWake UI.
 */
public final class VoskDebugState {
    private static final long EXPIRY_MS = 30_000L;
    private static volatile boolean enabled;
    private static volatile String hypothesis = "";
    private static volatile long updatedAt;

    private VoskDebugState() {}

    public static boolean enabled() {
        return enabled;
    }

    public static synchronized void setEnabled(boolean on) {
        enabled = on;
        hypothesis = "";
        updatedAt = 0L;
    }

    public static void accept(String text) {
        if (!enabled || text == null || text.isBlank()) return;
        String clipped = text.length() > 110 ? text.substring(0, 110) : text;
        hypothesis = clipped;
        updatedAt = SystemClock.elapsedRealtime();
    }

    public static String latest() {
        if (!enabled) return "";
        if (SystemClock.elapsedRealtime() - updatedAt > EXPIRY_MS) {
            hypothesis = "";
            return "";
        }
        return hypothesis;
    }
}
