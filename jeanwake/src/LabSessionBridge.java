package com.desmond.gptwake;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.Settings;

/**
 * Optional bridge to the selected JeanWake Assistant Lab, signed with the
 * same developer certificate and protected by a signature permission.
 * It requests a VoiceInteractionSession; it NEVER unlocks the keyguard.
 */
public final class LabSessionBridge {
    private static final String LAB = "br.com.jeanborba.assistantlab";
    private static final String SERVICE = LAB + "/.JeanWakeVoiceService";
    private static final String PERMISSION = LAB + ".permission.REQUEST_SESSION";
    private static final String ACTION = LAB + ".action.WAKE_DETECTED";
    private static final String RECEIVER = LAB + ".WakeBridgeReceiver";

    private LabSessionBridge() { }

    public static boolean isSelected(Context context) {
        try {
            String value = Settings.Secure.getString(
                    context.getContentResolver(), "assistant");
            return SERVICE.equals(value)
                    || (value != null
                    && value.startsWith(LAB + "/")
                    && value.endsWith("JeanWakeVoiceService"));
        } catch (Exception error) {
            L.e("JEANWAKE_BRIDGE_SELECTION_QUERY_FAILED", error);
            return false;
        }
    }

    public static boolean requestNativeSession(Context context) {
        if (!isSelected(context)) {
            L.i("JEANWAKE_BRIDGE_NOT_ASSISTANT");
            return false;
        }
        if (context.checkSelfPermission(PERMISSION) !=
                PackageManager.PERMISSION_GRANTED) {
            L.i("JEANWAKE_BRIDGE_SIGNATURE_PERMISSION_NOT_GRANTED");
            return false;
        }
        try {
            Intent intent = new Intent(ACTION).setClassName(LAB, RECEIVER)
                    .addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
            context.sendBroadcast(intent);
            // Broadcast dispatch accepted != voice session shown.
            L.i("JEANWAKE_BRIDGE_BROADCAST_SENT");
            return true;
        } catch (RuntimeException error) {
            L.e("JEANWAKE_BRIDGE_DISPATCH_FAIL", error);
            return false;
        }
    }
}
