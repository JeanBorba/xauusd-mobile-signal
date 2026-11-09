package br.com.jeanborba.assistantlab;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * All role changes are via official Android UI after an explicit user tap.
 * Nothing is selected through ADB or silently on startup.
 */
public final class MainActivity extends Activity {
    private static final int ROLE_REQUEST = 4001;
    private TextView status;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (18 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("JeanWake Assistant Lab 0.6.0");
        title.setTextSize(24);
        root.addView(title);

        TextView description = new TextView(this);
        description.setText("Aplicativo separado do JeanWake 0.5.2. "
                + "Somente experimentos de sessão de assistente Android. "
                + "Não faz gravações nem altera o assistente sozinho. "
                + "Selecioná-lo temporariamente como assistente padrão pode "
                + "desativar os comandos do ChatGPT como assistente do sistema.");
        description.setTextSize(16);
        root.addView(description);

        status = new TextView(this);
        status.setTextSize(17);
        root.addView(status);

        addButton(root, "Solicitar seleção no Android (opcional)", () -> {
            RoleManager rm = getSystemService(RoleManager.class);
            if (rm == null || !rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) {
                toast("Função de assistente não disponível neste aparelho");
                return;
            }
            Log.i(JeanWakeVoiceService.TAG, "LAB_ROLE_PICKER_OPENED_BY_USER");
            startActivityForResult(
                    rm.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT), ROLE_REQUEST);
        });

        addButton(root, "Mostrar sessão experimental", () -> {
            boolean shown = JeanWakeVoiceService.requestDemoSession();
            toast(shown ? "Sessão solicitada" :
                    "Primeiro selecione este app como assistente padrão");
        });

        addButton(root, "Gerenciar assistente padrão / restaurar ChatGPT", () -> {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS));
            } catch (Exception error) {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            }
        });
        addButton(root, "Atualizar estado", this::refresh);
        setContentView(scroll);
        refresh();
    }

    @Override protected void onResume() {
        super.onResume();
        if (status != null) refresh();
    }

    @Override protected void onActivityResult(int requestCode,
                                              int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == ROLE_REQUEST) {
            Log.i(JeanWakeVoiceService.TAG,
                    "LAB_ROLE_PICKER_RESULT code=" + resultCode);
            refresh();
        }
    }

    private void refresh() {
        RoleManager manager = getSystemService(RoleManager.class);
        boolean available = manager != null
                && manager.isRoleAvailable(RoleManager.ROLE_ASSISTANT);
        boolean held = available && manager.isRoleHeld(RoleManager.ROLE_ASSISTANT);
        boolean active = JeanWakeVoiceService.isSelected(this);
        status.setText("Role ASSISTANT disponível: " + available
                + "\nJeanWake Lab selecionado: " + held
                + "\nVoiceInteractionService ativo: " + active
                + "\n\nNunca altere o assistente sem uma decisão consciente. "
                + "Para restaurar o ChatGPT, use o botão de gerenciamento.");
        Log.i(JeanWakeVoiceService.TAG,
                "LAB_ROLE_STATUS available=" + available
                + " held=" + held + " active=" + active);
    }

    private void addButton(LinearLayout root, String label, Runnable action) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setOnClickListener(v -> action.run());
        root.addView(button);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}