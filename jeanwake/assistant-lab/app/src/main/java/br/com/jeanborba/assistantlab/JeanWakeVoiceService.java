package br.com.jeanborba.assistantlab;

import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.service.voice.VoiceInteractionService;
import android.util.Log;

/** Minimal assistant role experiment; does not capture audio. */
public final class JeanWakeVoiceService extends VoiceInteractionService {
    static final String TAG = "JEANWAKE_ASSIST_LAB";
    private static volatile JeanWakeVoiceService active;

    static boolean isSelected(Context context) {
        return isActiveService(context, new ComponentName(context, JeanWakeVoiceService.class));
    }

    static boolean requestDemoSession() {
        JeanWakeVoiceService service = active;
        if (service == null || !isSelected(service)) {
            Log.i(TAG, "LAB_SESSION_REQUEST_SKIPPED notActive=true");
            return false;
        }
        try {
            Log.i(TAG, "LAB_SESSION_REQUEST");
            service.showSession(new Bundle(), 0);
            return true;
        } catch (RuntimeException error) {
            Log.e(TAG, "LAB_SESSION_REQUEST_FAIL", error);
            return false;
        }
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
        try {
            showSession(new Bundle(), 0);
        } catch (RuntimeException error) {
            Log.e(TAG, "LAB_KEYGUARD_ASSIST_FAIL", error);
        }
    }
}