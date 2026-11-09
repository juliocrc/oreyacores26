package pt.oreyacores.tecnicos;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Button;
import android.widget.Spinner;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.fragment.app.FragmentActivity;
import com.google.android.material.switchmaterial.SwitchMaterial;

/**
 * Tela de configurações: tema escuro, modo economia, alto contraste,
 * estação ativa, exportar relatório, assinar, QR.
 */
public class SettingsActivity extends FragmentActivity {

    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        prefs = getSharedPreferences(OreyApplication.PREFS_NAME, MODE_PRIVATE);

        // Layout simples criado programaticamente
        android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
        layout.setOrientation(android.widget.LinearLayout.VERTICAL);
        layout.setPadding(dp(24), dp(24), dp(24), dp(24));

        android.widget.TextView title = new android.widget.TextView(this);
        title.setText(R.string.settings_title);
        title.setTextSize(22);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        layout.addView(title);

        // Modo escuro
        SwitchMaterial darkSwitch = new SwitchMaterial(this);
        darkSwitch.setText(R.string.settings_dark_mode);
        darkSwitch.setChecked(prefs.getBoolean(OreyApplication.KEY_DARK_MODE, false));
        darkSwitch.setOnCheckedChangeListener((btn, checked) -> {
            prefs.edit().putBoolean(OreyApplication.KEY_DARK_MODE, checked).apply();
            AppCompatDelegate.setDefaultNightMode(
                    checked ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
            Toast.makeText(this, checked ? "Modo escuro ativado" : "Modo claro ativado",
                    Toast.LENGTH_SHORT).show();
        });
        layout.addView(darkSwitch, lp());

        // Modo economia de energia
        SwitchMaterial lowPowerSwitch = new SwitchMaterial(this);
        lowPowerSwitch.setText(R.string.settings_low_power);
        lowPowerSwitch.setChecked(prefs.getBoolean(OreyApplication.KEY_LOW_POWER, false));
        lowPowerSwitch.setOnCheckedChangeListener((btn, checked) -> {
            prefs.edit().putBoolean(OreyApplication.KEY_LOW_POWER, checked).apply();
            Toast.makeText(this, checked ? "Economia de energia ativada" : "Economia desativada",
                    Toast.LENGTH_SHORT).show();
        });
        layout.addView(lowPowerSwitch, lp());

        // Alto contraste
        SwitchMaterial contrastSwitch = new SwitchMaterial(this);
        contrastSwitch.setText(R.string.settings_high_contrast);
        contrastSwitch.setChecked(prefs.getBoolean(OreyApplication.KEY_HIGH_CONTRAST, false));
        contrastSwitch.setOnCheckedChangeListener((btn, checked) -> {
            prefs.edit().putBoolean(OreyApplication.KEY_HIGH_CONTRAST, checked).apply();
            if (getApplication() instanceof OreyApplication) {
                ((OreyApplication) getApplication()).applyThemeFromPrefs();
            }
            recreate();
        });
        layout.addView(contrastSwitch, lp());

        // Botão: exportar relatório
        Button exportBtn = new Button(this);
        exportBtn.setText(R.string.settings_export);
        exportBtn.setAllCaps(false);
        exportBtn.setOnClickListener(v -> {
            Intent i = new Intent(this, MainActivity.class);
            i.putExtra("action", "export_report");
            startActivity(i);
        });
        layout.addView(exportBtn, lp());

        // Botão: assinar documento
        Button signBtn = new Button(this);
        signBtn.setText(R.string.settings_sign);
        signBtn.setAllCaps(false);
        signBtn.setOnClickListener(v -> {
            startActivity(new Intent(this, SignatureActivity.class));
        });
        layout.addView(signBtn, lp());

        // Botão: QR scanner
        Button qrBtn = new Button(this);
        qrBtn.setText(R.string.settings_scan_qr);
        qrBtn.setAllCaps(false);
        qrBtn.setOnClickListener(v -> {
            startActivity(new Intent(this, QrScannerActivity.class));
        });
        layout.addView(qrBtn, lp());

        // Botão: voltar
        Button backBtn = new Button(this);
        backBtn.setText(R.string.close);
        backBtn.setAllCaps(false);
        backBtn.setOnClickListener(v -> finish());
        layout.addView(backBtn, lp());

        setContentView(layout);
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    private android.widget.LinearLayout.LayoutParams lp() {
        android.widget.LinearLayout.LayoutParams p = new android.widget.LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(16);
        return p;
    }
}
