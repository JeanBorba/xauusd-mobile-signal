package com.desmond.gptwake;

import android.content.Context;

/**
 * Explicit opt-in only. Launching the assistant after a wake hit is experimental
 * because the tiny offline ASR may have false positives.
 */
public final class AssistLaunchOptions {
    private static final String PREFS = "jeanwake_assistant_launch";
    private static final String AUTO = "auto_assist_after_wake";

    private AssistLaunchOptions() {}

    public static boolean autoLaunch(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(AUTO, false);
    }

    public static void setAutoLaunch(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(AUTO, enabled).apply();
    }
}