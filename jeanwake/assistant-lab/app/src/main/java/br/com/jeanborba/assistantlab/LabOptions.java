package br.com.jeanborba.assistantlab;

import android.content.Context;

final class LabOptions {
    private static final String PREFS = "jeanwake_lab_options";
    private static final String AUTO = "auto_chatgpt_after_wake_voiceactivity_explicit_063";
    private LabOptions() { }

    static boolean autoChatGpt(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(AUTO, false);
    }
    static void setAutoChatGpt(Context context, boolean value) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(AUTO, value).apply();
    }
}
