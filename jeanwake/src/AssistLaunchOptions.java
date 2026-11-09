package com.desmond.gptwake;

import android.content.Context;

/**
 * Explicit opt-in only. Launching the assistant after a wake hit is experimental
 * because the tiny offline ASR may have false positives.
 */
public final class AssistLaunchOptions {
    private static final String PREFS = "jeanwake_assistant_launch";
    private static final String AUTO = "auto_assist_after_wake";
    // Previous opt-in cannot carry over to a different voice launch mechanism.
    private static final String EXPLICIT_V052 = "voice_link_052_opted_in";

    private AssistLaunchOptions() {}

    public static boolean autoLaunch(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(AUTO, false)
                && context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getBoolean(EXPLICIT_V052, false);
    }

    public static void setAutoLaunch(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(AUTO, enabled)
                .putBoolean(EXPLICIT_V052, enabled).apply();
    }
}