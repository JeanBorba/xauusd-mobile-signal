package br.com.jeanborba.assistantlab;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.ComponentName;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.voice.VoiceInteractionSession;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Opaque assistant UI. Can be shown above the lock screen by the OS.
 * No authentication bypass and no audio recording by this lab.
 */
public final class JeanWakeVoiceSession extends VoiceInteractionSession {
    private TextView state;
    private boolean fromWake;
    private long lastAutomaticAttemptElapsed;
    private final Handler main = new Handler(Looper.getMainLooper());

    public JeanWakeVoiceSession(Context context) {
        super(context);
    }

    @Override public View onCreateContentView() {
        Context context = getContext();
        float density = context.getResources().getDisplayMetrics().density;
        int pad = (int) (18 * density);
        ScrollView scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(248, 250, 253));
        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.rgb(248, 250, 253));
        scroll.addView(root);

        TextView title = new TextView(context);
        title.setText("JeanWake • Assistente");
        title.setTextColor(Color.rgb(24, 35, 60));
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextSize(22);
        root.addView(title);

        state = new TextView(context);
        state.setTextColor(Color.rgb(35, 43, 57));
        state.setTextSize(15);
        state.setPadding(0, pad / 2, 0, pad / 2);
        state.setText("Sessão do assistente Android. Não desbloqueia o telefone.");
        root.addView(state);

        add(root, "Abrir voz do ChatGPT (via assistant)", () -> requestChatGpt(true));
        add(root, "Alternativa: componente público explícito", () -> requestChatGpt(false));
        add(root, "Fechar sessão", this::finish);
        return scroll;
    }

    private void add(LinearLayout parent, String label, Runnable action) {
        Button button = new Button(getContext());
        button.setAllCaps(false);
        button.setText(label);
        button.setOnClickListener(v -> action.run());
        parent.addView(button);
    }

    @Override public void onShow(Bundle args, int flags) {
        super.onShow(args, flags);
        KeyguardManager manager = getContext().getSystemService(KeyguardManager.class);
        boolean locked = manager != null && manager.isKeyguardLocked();
        fromWake = args != null && args.getBoolean(JeanWakeVoiceService.ARG_WAKE, false);
        if (getWindow() != null && getWindow().getWindow() != null) {
            getWindow().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        }
        Log.i(JeanWakeVoiceService.TAG, "LAB_SESSION_SHOWN keyguard=" + locked
                + " fromWake=" + fromWake + " flags=" + flags);
        if (state != null) {
            state.setText("Sessão: " + (fromWake ? "Ei, GPT reconhecido" : "teste manual")
                    + "\nBloqueio de tela: " + (locked ? "ATIVO" : "não")
                    + "\nEsta tela não remove a autenticação do Android.");
        }
        // Separate opt-in for this alternative. Cooldown avoids repeated
        // launches after false-positive speech or duplicate wake broadcasts.
        if (fromWake && LabOptions.autoChatGpt(getContext())) {
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - lastAutomaticAttemptElapsed >= 30_000L) {
                lastAutomaticAttemptElapsed = now;
                Log.i(JeanWakeVoiceService.TAG,
                        "LAB_AUTO_VOICE_ACTIVITY_SCHEDULED keyguard=" + locked);
                main.postDelayed(() -> {
                    Log.i(JeanWakeVoiceService.TAG, "LAB_AUTO_VOICE_ACTIVITY_BEGIN");
                    requestChatGpt(false);
                }, 650L);
            } else {
                Log.i(JeanWakeVoiceService.TAG,
                        "LAB_AUTO_VOICE_ACTIVITY_REJECTED_COOLDOWN");
            }
        }
    }

    @Override public void onHide() {
        Log.i(JeanWakeVoiceService.TAG, "LAB_SESSION_HIDDEN");
        super.onHide();
    }

    @Override public void onTaskStarted(Intent intent, int taskId) {
        Log.i(JeanWakeVoiceService.TAG, "LAB_CHATGPT_TASK_STARTED id=" + taskId);
        super.onTaskStarted(intent, taskId);
    }

    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        Log.i(JeanWakeVoiceService.TAG, "LAB_SESSION_DESTROYED");
        super.onDestroy();
    }

    private void requestChatGpt(boolean assistantLayer) {
        Intent intent = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://chat.com/?mode=voice"))
                .setPackage("com.openai.chatgpt");
        intent.putExtra(
                "com.openai.feature.shortcut.impl.ShortcutInitializer.EXTRA_SHORTCUT",
                "launcher_shortcut");
        try {
            KeyguardManager km = getContext().getSystemService(KeyguardManager.class);
            boolean locked = km != null && km.isKeyguardLocked();
            Log.i(JeanWakeVoiceService.TAG, "LAB_CHATGPT_REQUEST"
                    + " assistantLayer=" + assistantLayer + " keyguard=" + locked);
            if (assistantLayer) {
                startAssistantActivity(intent);
            } else {
                // CATEGORY_VOICE is added by the Android framework and the
                // ChatGPT link does not advertise it. Use only the publicly
                // exported handler that resolves BEFORE adding CATEGORY_VOICE.
                PackageManager pm = getContext().getPackageManager();
                ResolveInfo handler = pm.resolveActivity(
                        intent, PackageManager.MATCH_DEFAULT_ONLY);
                if (handler == null || handler.activityInfo == null
                        || !handler.activityInfo.exported
                        || !"com.openai.chatgpt".equals(
                                handler.activityInfo.packageName)) {
                    throw new ActivityNotFoundException(
                            "No exported ChatGPT deep link handler");
                }
                intent.setComponent(new ComponentName(
                        handler.activityInfo.packageName,
                        handler.activityInfo.name));
                Log.i(JeanWakeVoiceService.TAG,
                        "LAB_EXPLICIT_PUBLIC_HANDLER=" + handler.activityInfo.name);
                startVoiceActivity(intent);
            }
            if (state != null) state.setText("Abertura solicitada. Confira a voz do "
                    + "ChatGPT. Enviar o comando não prova que o aplicativo abriu.");
            Log.i(JeanWakeVoiceService.TAG, "LAB_CHATGPT_INTENT_SENT"
                    + " assistantLayer=" + assistantLayer);
        } catch (Exception error) {
            Log.e(JeanWakeVoiceService.TAG, "LAB_CHATGPT_START_ERROR", error);
            if (state != null) state.setText("Android recusou: "
                    + error.getClass().getSimpleName());
        }
    }
}
