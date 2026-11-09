package pt.oreyacores.clientes;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.fragment.app.FragmentActivity;
import com.google.android.material.switchmaterial.SwitchMaterial;

/**
 * Tela de configurações do cliente: tema escuro, alto contraste, QR, assinatura.
 */
public class SettingsActivity extends FragmentActivity {

    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        prefs = getSharedPreferences(OreyClienteApplication.PREFS_NAME, MODE_PRIVATE);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(24), dp(24), dp(24), dp(24));

        TextView title = new TextView(this);
        title.setText(R.string.settings_title);
        title.setTextSize(22);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        layout.addView(title);

        // Modo escuro
        SwitchMaterial darkSwitch = new SwitchMaterial(this);
        darkSwitch.setText(R.string.settings_dark_mode);
        darkSwitch.setChecked(prefs.getBoolean(OreyClienteApplication.KEY_DARK_MODE, false));
        darkSwitch.setOnCheckedChangeListener((btn, checked) -> {
            prefs.edit().putBoolean(OreyClienteApplication.KEY_DARK_MODE, checked).apply();
            AppCompatDelegate.setDefaultNightMode(
                    checked ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
            Toast.makeText(this, checked ? "Modo escuro ativado" : "Modo claro ativado",
                    Toast.LENGTH_SHORT).show();
        });
        layout.addView(darkSwitch, lp());

        // Alto contraste
        SwitchMaterial contrastSwitch = new SwitchMaterial(this);
        contrastSwitch.setText(R.string.settings_high_contrast);
        contrastSwitch.setChecked(prefs.getBoolean(OreyClienteApplication.KEY_HIGH_CONTRAST, false));
        contrastSwitch.setOnCheckedChangeListener((btn, checked) -> {
            prefs.edit().putBoolean(OreyClienteApplication.KEY_HIGH_CONTRAST, checked).apply();
            if (getApplication() instanceof OreyClienteApplication) {
                ((OreyClienteApplication) getApplication()).applyThemeFromPrefs();
            }
            recreate();
        });
        layout.addView(contrastSwitch, lp());

        // QR scanner
        Button qrBtn = new Button(this);
        qrBtn.setText(R.string.settings_scan_qr);
        qrBtn.setAllCaps(false);
        qrBtn.setOnClickListener(v -> startActivity(new Intent(this, QrScannerActivity.class)));
        layout.addView(qrBtn, lp());

        // Assinar documento
        Button signBtn = new Button(this);
        signBtn.setText(R.string.settings_sign);
        signBtn.setAllCaps(false);
        signBtn.setOnClickListener(v -> startActivity(new Intent(this, SignatureActivity.class)));
        layout.addView(signBtn, lp());

        // Voltar
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

    private LinearLayout.LayoutParams lp() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(16);
        return p;
    }
}
