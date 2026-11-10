package br.com.jeanborba.assistantlab;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;

/**
 * Accepts on-device wake notifications ONLY from apps signed with the same
 * certificate (manifest receiver permission is protectionLevel=signature).
 */
public final class WakeBridgeReceiver extends BroadcastReceiver {
    public static final String ACTION =
            "br.com.jeanborba.assistantlab.action.WAKE_DETECTED";
    public static final String PERMISSION =
            "br.com.jeanborba.assistantlab.permission.REQUEST_SESSION";
    private static long lastRequest;

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION.equals(intent.getAction())) return;
        if (!JeanWakeVoiceService.isSelected(context)) {
            Log.w(JeanWakeVoiceService.TAG, "LAB_BRIDGE_REJECT_NOT_SELECTED");
            return;
        }
        long now = SystemClock.elapsedRealtime();
        if (now - lastRequest < 12_000L) {
            Log.i(JeanWakeVoiceService.TAG, "LAB_BRIDGE_REJECT_COOLDOWN");
            return;
        }
        lastRequest = now;
        Log.i(JeanWakeVoiceService.TAG, "LAB_BRIDGE_RECEIVED");
        boolean sent = JeanWakeVoiceService.requestWakeSession();
        Log.i(JeanWakeVoiceService.TAG, "LAB_BRIDGE_SESSION_REQUESTED=" + sent);
    }
}
