package br.com.jeanborba.assistantlab;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;
import android.util.Log;

public final class JeanWakeVoiceSessionService extends VoiceInteractionSessionService {
    @Override public VoiceInteractionSession onNewSession(Bundle args) {
        Log.i(JeanWakeVoiceService.TAG, "LAB_VOICE_SESSION_CREATED");
        return new JeanWakeVoiceSession(this);
    }
}
