package com.desmond.gptwake;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

/**
 * JeanWake development helper. Read-only inspection: never calls a privileged or hidden API.
 * Helps distinguish a detector failure from an Android launch restriction.
 */
public final class LaunchDiagnostics {
    private LaunchDiagnostics() {}

    public static void log(Context context) {
        final PackageManager pm = context.getPackageManager();
        inspectExplicit(pm,
                new ComponentName("com.openai.chatgpt",
                        "com.openai.voice.assistant.AssistantActivity"),
                "PRIVATE_ASSISTANT_ACTIVITY");

        inspectImplicit(pm,
                new Intent(Intent.ACTION_ASSIST),
                "PUBLIC_ACTION_ASSIST");
        inspectImplicit(pm,
                new Intent(Intent.ACTION_VOICE_COMMAND),
                "PUBLIC_ACTION_VOICE_COMMAND");
        inspectImplicit(pm,
                new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://chat.com/?mode=voice"))
                        .setPackage("com.openai.chatgpt"),
                "PUBLIC_VOICE_DEEPLINK");
    }

    private static void inspectExplicit(PackageManager pm, ComponentName name,
                                        String label) {
        try {
            ActivityInfo info = pm.getActivityInfo(name, 0);
            L.i("JEANWAKE_PROBE " + label + " exported=" + info.exported
                    + " permission=" + info.permission);
        } catch (Exception e) {
            L.i("JEANWAKE_PROBE " + label + " unavailable=" +
                    e.getClass().getSimpleName());
        }
    }

    private static void inspectImplicit(PackageManager pm, Intent intent,
                                        String label) {
        try {
            ResolveInfo ri = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (ri == null || ri.activityInfo == null) {
                L.i("JEANWAKE_PROBE " + label + " no_resolver");
                return;
            }
            ActivityInfo ai = ri.activityInfo;
            L.i("JEANWAKE_PROBE " + label + " target=" + ai.packageName
                    + "/" + ai.name + " exported=" + ai.exported);
        } catch (Exception e) {
            L.i("JEANWAKE_PROBE " + label + " error=" +
                    e.getClass().getSimpleName());
        }
    }
}
