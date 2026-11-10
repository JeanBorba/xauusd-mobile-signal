package com.desmond.gptwake;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Optional configuration. No AccessKey or private model file is bundled in the APK. */
public final class PortugueseSetupActivity extends Activity {
    private static final int PICK_KEYWORD = 801;
    private static final int PICK_LANGUAGE = 802;

    private TextView state;
    private EditText keyInput;
    private Button autoLaunchButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            PtBrSettings.ensureBundledPortugueseModel(this);
        } catch (java.io.IOException error) {
            L.e("JEANWAKE_PT_MODEL_IMPORT_FAIL", error);
        }
        setTitle("JeanWake — Português");
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        content.setPadding(pad, pad, pad, pad);
        scroll.addView(content);

        addText(content, "Ativação: Ei, GPT", 22);
        addText(content,
                "Configuração experimental. É necessária uma AccessKey do Picovoice, " +
                "um arquivo .ppn criado para Android e um modelo de português .pv. " +
                "Os arquivos serão copiados para a área privada do JeanWake.", 15);
        state = addText(content, "", 15);
        keyInput = new EditText(this);
        keyInput.setHint("AccessKey do Picovoice (não será exibida)");
        keyInput.setSingleLine(true);
        keyInput.setInputType(InputType.TYPE_CLASS_TEXT |
                InputType.TYPE_TEXT_VARIATION_PASSWORD);
        content.addView(keyInput);
        addButton(content, "Salvar chave criptografada", v -> {
            try {
                PtBrSettings.saveAccessKey(this, keyInput.getText().toString());
                keyInput.setText("");
                message("AccessKey salva somente neste aparelho");
            } catch (Exception e) {
                message("Não foi possível salvar a chave");
            }
            refresh();
        });
        addText(content, "Sem cadastro: usar o Vosk, com reconhecimento local e gratuito. " +
                "É experimental e poderá consumir mais bateria.", 15);
        addButton(content, "Ativar português sem conta (Vosk)", v -> {
            if (WakeService.isForegroundNow()) {
                message("Pressione Stop antes de trocar o reconhecimento");
                return;
            }
            state.setText("Preparando modelo offline em português...");
            new Thread(() -> {
                try {
                    VoskPtBrAssets.prepare(this);
                    VoskPtBrAssets.setEnabled(this, true);
                    runOnUiThread(() -> {
                        message("Português offline selecionado. Volte e toque em Start.");
                        refresh();
                    });
                } catch (Exception e) {
                    L.e("JEANWAKE_VOSK_PREPARE_FAIL", e);
                    runOnUiThread(() -> {
                        message("Falha ao preparar o modelo de português");
                        refresh();
                    });
                }
            }, "vosk-ptbr-setup").start();
        });
        addButton(content, "Desativar português sem conta", v -> {
            if (WakeService.isForegroundNow()) {
                message("Pressione Stop antes de trocar o reconhecimento");
                return;
            }
            VoskPtBrAssets.setEnabled(this, false);
            message("Modo Vosk desligado");
            refresh();
        });

        addText(content,
                "Conversa do ChatGPT (experimental). A frase curta Ei, GPT "
                + "pode ser confundida com falas comuns. Por padrao, nao abre "
                + "nenhum outro aplicativo automaticamente.", 15);
        addText(content,
                "Antes de testar a abertura normal: abra o ChatGPT oficial e "
                + "ative Configuracoes > Voz > Iniciar com voz, se esta opcao "
                + "estiver disponivel. A OpenAI informa que ela funciona "
                + "para conversas novas ou vazias.", 15);
        addText(content,
                "JeanWake 0.6.4: com a tela desbloqueada, a voz abre como antes. "
                + "Com a tela bloqueada, o JeanWake mostra uma notificacao "
                + "para tocar e abrir o ChatGPT, respeitando a seguranca "
                + "do Android. Pode ser necessario desbloquear o aparelho. "
                + "A ativacao pela frase curta e experimental.", 15);
        addButton(content, "Testar notificacao de voz", v -> {
            boolean posted = WakeVoiceNotification.show(this);
            message(posted
                    ? "Notificacao enviada. Confira o painel e toque para abrir a voz."
                    : "Notificacao indisponivel: verifique as permissoes do Android.");
        });
        addText(content,
                "Nova rota experimental: um link de voz com a identificacao "
                + "do atalho oficial iniciou o microfone do ChatGPT por ADB. "
                + "Vamos testar dentro do JeanWake.", 15);
        addButton(content, "Testar VOZ do ChatGPT (novo)", v -> {
            if (WakeService.isForegroundNow()) {
                message("Primeiro pressione Stop no JeanWake");
                return;
            }
            boolean accepted = GptLauncher.launchChatGptVoice(this);
            message(accepted
                    ? "Comando de voz enviado. Confira se a conversa iniciou."
                    : "O Android recusou o link de voz.");
        });
        addButton(content, "Testar abrir ChatGPT normalmente", v -> {
            if (WakeService.isForegroundNow()) {
                message("Primeiro pressione Stop no JeanWake");
                return;
            }
            boolean accepted = GptLauncher.launchChatGptMain(this);
            message(accepted
                    ? "Abertura solicitada. Verifique se a voz comecou."
                    : "Nao foi possivel abrir o ChatGPT.");
        });
        addText(content,
                "O botao antigo de assistente nao iniciou voz neste telefone. "
                + "Mantido somente como diagnostico.", 14);
        addButton(content, "Testar abertura do assistente ChatGPT", v -> {
            if (WakeService.isForegroundNow()) {
                message("Pressione Stop no JeanWake antes do teste de abertura");
                return;
            }
            boolean accepted = GptLauncher.launchPublicAssist(this);
            message(accepted
                    ? "Comando enviado ao ChatGPT. Confira se a voz iniciou."
                    : "O Android nao aceitou o comando de assistente.");
        });
        autoLaunchButton = addButton(content,
                "Ativar resposta ao Ei, GPT (experimental)", v -> {
            if (WakeService.isForegroundNow()) {
                message("Pressione Stop no JeanWake antes de mudar esta opcao");
                return;
            }
            boolean next = !AssistLaunchOptions.autoLaunch(this);
            AssistLaunchOptions.setAutoLaunch(this, next);
            message(next
                    ? "Resposta experimental habilitada (notificacao com tela bloqueada)"
                    : "Resposta ao Ei, GPT desabilitada");
            refresh();
        });
        addText(content,
                "A abertura e uma solicitacao ao Android. Nao ha garantia "
                + "de conversa por voz com a tela bloqueada. "
                + "A opcao automatica e desativada inicialmente.", 14);

        addButton(content, "Importar frase Android (.ppn)", v -> pick(PICK_KEYWORD));
        addButton(content, "Importar modelo português (.pv)", v -> pick(PICK_LANGUAGE));
        addButton(content, "Abrir Picovoice Console", v -> {
            startActivity(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://console.picovoice.ai/")));
        });
        addButton(content, "Ativar reconhecimento em português", v -> {
            if (WakeService.isForegroundNow()) {
                message("Primeiro pressione Stop no JeanWake e tente novamente");
                return;
            }
            if (!PtBrSettings.isReady(this)) {
                message("Falta a chave, o arquivo .ppn ou o modelo .pv");
                refresh();
                return;
            }
            PtBrSettings.setEnabled(this, true);
            message("Modo português selecionado. Volte e toque em Start");
            refresh();
        });
        addButton(content, "Voltar ao reconhecimento original", v -> {
            if (WakeService.isForegroundNow()) {
                message("Primeiro pressione Stop no JeanWake e tente novamente");
                return;
            }
            PtBrSettings.setEnabled(this, false);
            message("Modo original selecionado");
            refresh();
        });
        addText(content,
                "Segurança: a AccessKey é criptografada pelo Android Keystore. " +
                "Não a envie pelo chat, nem publique em GitHub. A chave e os modelos " +
                "não são enviados automaticamente ao GitHub.", 14);
        setContentView(scroll);
        refresh();
    }

    private TextView addText(LinearLayout parent, String text, int sp) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(sp);
        tv.setPadding(0, 12, 0, 12);
        parent.addView(tv);
        return tv;
    }

    private Button addButton(LinearLayout parent, String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setOnClickListener(listener);
        parent.addView(button);
        return button;
    }

    private void refresh() {
        if (autoLaunchButton != null) {
            autoLaunchButton.setText(AssistLaunchOptions.autoLaunch(this)
                ? "Desativar resposta ao Ei, GPT" : "Ativar resposta ao Ei, GPT (experimental)");
        }
        state.setText("Português sem conta: " +
                (VoskPtBrAssets.enabled(this) ? "ATIVADO" : "desligado") +
                " | Modelo offline: " +
                (VoskPtBrAssets.isReady(this) ? "OK" : "pendente") +
                "\nPicovoice (alternativo): chave " +
                (PtBrSettings.hasAccessKey(this) ? "OK" : "pendente") +
                "   |   .ppn: " + (PtBrSettings.hasKeyword(this) ? "OK" : "pendente") +
                "   |   .pv: " + (PtBrSettings.hasLanguage(this) ? "OK" : "pendente") +
                "\nModo português: " + (PtBrSettings.isEnabled(this) ? "ATIVO" : "desligado"));
    }

    private void pick(int requestCode) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(intent, requestCode);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        if (requestCode != PICK_KEYWORD && requestCode != PICK_LANGUAGE) return;
        try {
            PtBrSettings.importModel(this, data.getData(), requestCode == PICK_KEYWORD);
            message("Arquivo importado. A compatibilidade será validada ao iniciar");
        } catch (Exception e) {
            message("Não foi possível importar o arquivo");
        }
        refresh();
    }

    private void message(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
