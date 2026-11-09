package br.com.jeanborba.assistantlab;

import android.content.Intent;
import android.os.RemoteException;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;
import android.util.Log;

/** Placeholder: intentionally NOT a production speech recognizer. */
public final class LabRecognitionService extends RecognitionService {
    @Override protected void onStartListening(Intent intent, Callback callback) {
        Log.i(JeanWakeVoiceService.TAG, "LAB_RECOGNITION_NOT_IMPLEMENTED");
        try {
            callback.error(SpeechRecognizer.ERROR_CLIENT);
        } catch (RemoteException error) {
            Log.e(JeanWakeVoiceService.TAG, "LAB_RECOGNITION_CALLBACK_FAIL", error);
        }
    }

    @Override protected void onStopListening(Callback callback) {
        Log.i(JeanWakeVoiceService.TAG, "LAB_RECOGNITION_STOP");
    }

    @Override protected void onCancel(Callback callback) {
        Log.i(JeanWakeVoiceService.TAG, "LAB_RECOGNITION_CANCEL");
    }
}