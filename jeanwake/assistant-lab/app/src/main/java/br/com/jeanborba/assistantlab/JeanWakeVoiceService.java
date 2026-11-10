package br.com.jeanborba.assistantlab;

import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.service.voice.VoiceInteractionService;
import android.util.Log;

/** Selected Android assistant. Does not record audio itself. */
public final class JeanWakeVoiceService extends VoiceInteractionService {
    static final String TAG = "JEANWAKE_ASSIST_LAB";
    static final String ARG_WAKE = "br.com.jeanborba.assistantlab.arg.WAKE";
    private static volatile JeanWakeVoiceService active;

    static boolean isSelected(Context context) {
        return isActiveService(context, new ComponentName(context, JeanWakeVoiceService.class));
    }

    private static boolean show(boolean fromWake) {
        JeanWakeVoiceService service = active;
        if (service == null || !isSelected(service)) {
            Log.i(TAG, "LAB_SESSION_REQUEST_SKIPPED assistantNotActive=true");
            return false;
        }
        try {
            Bundle args = new Bundle();
            args.putBoolean(ARG_WAKE, fromWake);
            Log.i(TAG, "LAB_SESSION_REQUEST wake=" + fromWake);
            service.showSession(args, 0);
            return true;
        } catch (RuntimeException error) {
            Log.e(TAG, "LAB_SESSION_REQUEST_FAIL", error);
            return false;
        }
    }

    static boolean requestDemoSession() {
        return show(false);
    }

    static boolean requestWakeSession() {
        return show(true);
    }

    @Override public void onReady() {
        super.onReady();
        active = this;
        Log.i(TAG, "LAB_ASSIST_SERVICE_READY");
    }

    @Override public void onShutdown() {
        Log.i(TAG, "LAB_ASSIST_SERVICE_SHUTDOWN");
        if (active == this) active = null;
        super.onShutdown();
    }

    @Override public void onLaunchVoiceAssistFromKeyguard() {
        Log.i(TAG, "LAB_KEYGUARD_ASSIST_INVOKED");
        // System keyguard affordance, not an authentication bypass.
        show(false);
    }
}
