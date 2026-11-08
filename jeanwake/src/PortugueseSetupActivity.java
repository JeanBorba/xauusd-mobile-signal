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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("JeanWake — Português");
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        content.setPadding(pad, pad, pad, pad);
        scroll.addView(content);

        addText(content, "Ativação: Ei, ChatGPT", 22);
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

    private void addButton(LinearLayout parent, String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setOnClickListener(listener);
        parent.addView(button);
    }

    private void refresh() {
        state.setText("Chave: " + (PtBrSettings.hasAccessKey(this) ? "OK" : "pendente") +
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