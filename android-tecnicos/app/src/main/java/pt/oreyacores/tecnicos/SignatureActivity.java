package pt.oreyacores.tecnicos;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Environment;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.fragment.app.FragmentActivity;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Activity para capturar a assinatura digital do cliente.
 * Guarda a assinatura como PNG em Downloads.
 */
public class SignatureActivity extends FragmentActivity {

    private SignatureView signatureView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Impede screenshots
        getWindow().setFlags(
                android.view.WindowManager.LayoutParams.FLAG_SECURE,
                android.view.WindowManager.LayoutParams.FLAG_SECURE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#F1F5F9"));

        TextView title = new TextView(this);
        title.setText(R.string.signature_title);
        title.setTextSize(20);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setPadding(dp(16), dp(16), dp(16), dp(8));
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText(R.string.signature_hint);
        hint.setTextSize(14);
        hint.setPadding(dp(16), 0, dp(16), dp(8));
        root.addView(hint);

        signatureView = new SignatureView(this);
        LinearLayout.LayoutParams sigParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        sigParams.setMargins(dp(16), 0, dp(16), dp(16));
        root.addView(signatureView, sigParams);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);

        Button clearBtn = new Button(this);
        clearBtn.setText(R.string.signature_clear);
        clearBtn.setAllCaps(false);
        clearBtn.setOnClickListener(v -> signatureView.clear());
        buttons.addView(clearBtn, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Button saveBtn = new Button(this);
        saveBtn.setText(R.string.signature_save);
        saveBtn.setAllCaps(false);
        saveBtn.setOnClickListener(v -> saveSignature());
        buttons.addView(saveBtn, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Button closeBtn = new Button(this);
        closeBtn.setText(R.string.close);
        closeBtn.setAllCaps(false);
        closeBtn.setOnClickListener(v -> finish());
        buttons.addView(closeBtn, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        root.addView(buttons, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(root);
    }

    private void saveSignature() {
        if (!signatureView.hasSignature()) {
            Toast.makeText(this, "Assine primeiro.", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Bitmap bmp = signatureView.getSignatureBitmap();
            File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (dir == null) dir = getFilesDir();
            File file = new File(dir, "assinatura_" + System.currentTimeMillis() + ".png");
            try (FileOutputStream out = new FileOutputStream(file)) {
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            }
            Toast.makeText(this, "Assinatura guardada: " + file.getName(),
                    Toast.LENGTH_LONG).show();
            finish();
        } catch (Exception e) {
            Toast.makeText(this, "Erro ao guardar assinatura.", Toast.LENGTH_SHORT).show();
        }
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }
}
