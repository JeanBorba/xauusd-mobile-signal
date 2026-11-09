package br.com.jeanborba.assistantlab;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Testing official assistant session mechanics; no automatic unlock or hotword. */
public final class JeanWakeVoiceSession extends VoiceInteractionSession {
    private TextView state;

    public JeanWakeVoiceSession(Context context) {
        super(context);
    }

    @Override public View onCreateContentView() {
        Context context = getContext();
        ScrollView scroll = new ScrollView(context);
        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * context.getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);
        TextView title = new TextView(context);
        title.setText("JeanWake Assistant Lab");
        title.setTextSize(24);
        root.addView(title);
        state = new TextView(context);
        state.setText("Sessão oficial de assistente em teste. Não desbloqueia o telefone.");
        state.setTextSize(16);
        root.addView(state);

        add(root, "Testar startVoiceActivity (ChatGPT)", () -> requestChatGpt(false));
        add(root, "Testar startAssistantActivity (ChatGPT)", () -> requestChatGpt(true));
        add(root, "Fechar sessão", this::finish);
        return scroll;
    }

    private void add(LinearLayout parent, String title, Runnable action) {
        Button button = new Button(getContext());
        button.setAllCaps(false);
        button.setText(title);
        button.setOnClickListener(v -> action.run());
        parent.addView(button);
    }

    @Override public void onShow(Bundle args, int flags) {
        super.onShow(args, flags);
        KeyguardManager manager = getContext().getSystemService(KeyguardManager.class);
        boolean locked = manager != null && manager.isKeyguardLocked();
        if (getWindow() != null && getWindow().getWindow() != null) {
            getWindow().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        }
        Log.i(JeanWakeVoiceService.TAG, "LAB_SESSION_SHOWN keyguard=" + locked
                + " flags=" + flags);
        if (state != null) state.setText("Sessão ativa | tela bloqueada: "
                + (locked ? "SIM" : "não")
                + "\nEscolha uma opção. Nenhum desbloqueio será forçado.");
    }

    @Override public void onHide() {
        Log.i(JeanWakeVoiceService.TAG, "LAB_SESSION_HIDDEN");
        super.onHide();
    }

    private void requestChatGpt(boolean assistantLayer) {
        Intent intent = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://chat.com/?mode=voice"))
                .setPackage("com.openai.chatgpt");
        intent.putExtra(
                "com.openai.feature.shortcut.impl.ShortcutInitializer.EXTRA_SHORTCUT",
                "launcher_shortcut");
        try {
            Log.i(JeanWakeVoiceService.TAG, "LAB_CHATGPT_REQUEST"
                    + " assistantLayer=" + assistantLayer);
            if (assistantLayer) startAssistantActivity(intent);
            else startVoiceActivity(intent);
            if (state != null) state.setText("Abertura solicitada; veja o ChatGPT. "
                    + "Isso não confirma a sessão de voz.");
            Log.i(JeanWakeVoiceService.TAG, "LAB_CHATGPT_INTENT_SENT"
                    + " assistantLayer=" + assistantLayer);
        } catch (Exception error) {
            Log.e(JeanWakeVoiceService.TAG, "LAB_CHATGPT_START_ERROR", error);
            if (state != null) state.setText("Android recusou a abertura: "
                    + error.getClass().getSimpleName());
        }
    }
}