package pt.oreyacores.tecnicos;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Visualizador interno de PDFs para a aplicação Técnicos.
 * Inclui barra de carregamento enquanto o documento é aberto/renderizado.
 */
public class PdfViewerActivity extends Activity {
    public static final String EXTRA_TITLE = "pdf_title";

    private PdfRenderer renderer;
    private ParcelFileDescriptor descriptor;
    private int pageIndex;
    private int pageCount;
    private ImageView pageImage;
    private TextView pageLabel;
    private TextView errorView;
    private Button previousButton;
    private Button nextButton;
    private ScrollView scrollView;
    private Bitmap currentBitmap;
    private LinearLayout root;
    private Uri pdfUri;
    private String pdfTitle;
    private ProgressBar loadingBar;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // impede screenshots
        getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE,
                android.view.WindowManager.LayoutParams.FLAG_SECURE);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#F1F5F9"));
        setContentView(root);
        applyInsets();

        // barra de carregamento
        loadingBar = new ProgressBar(this);
        loadingBar.setIndeterminate(true);
        loadingBar.setVisibility(View.GONE);
        LinearLayout.LayoutParams loadingParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        loadingParams.gravity = Gravity.CENTER;
        root.addView(loadingBar, loadingParams);

        buildTopBar();
        buildPageArea();
        buildBottomBar();

        Uri uri = getIntent() == null ? null : getIntent().getData();
        if (uri == null) {
            showError("Documento inválido.");
            return;
        }
        pdfUri = uri;
        openPdf(uri);
    }

    private int dp(int value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
    }

    private void applyInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void buildTopBar() {
        String title = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_TITLE);
        if (TextUtils.isEmpty(title)) title = getString(R.string.pdf_title);
        title = title.replaceFirst("(?i)\\.pdf$", "");
        pdfTitle = title;
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.parseColor("#0B4F6C"));
        bar.setPadding(dp(16), dp(8), dp(8), dp(8));

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(16);
        titleView.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        titleView.setMaxLines(1);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        bar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button menu = new Button(this);
        menu.setText("⋮");
        menu.setTextSize(20);
        menu.setAllCaps(false);
        menu.setTextColor(Color.WHITE);
        menu.setBackgroundColor(Color.TRANSPARENT);
        menu.setMinWidth(0);
        menu.setMinimumWidth(0);
        menu.setPadding(dp(12), 0, dp(12), 0);
        menu.setOnClickListener(this::showOptionsMenu);
        bar.addView(menu, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button close = new Button(this);
        close.setText(R.string.close);
        close.setAllCaps(false);
        close.setTextColor(Color.WHITE);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setOnClickListener(v -> finish());
        bar.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));
    }

    private void buildPageArea() {
        scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(Color.parseColor("#F1F5F9"));

        pageImage = new ImageView(this);
        pageImage.setAdjustViewBounds(true);
        pageImage.setScaleType(ImageView.ScaleType.FIT_CENTER);
        pageImage.setBackgroundColor(Color.WHITE);
        pageImage.setPadding(dp(12), dp(12), dp(12), dp(12));
        scrollView.addView(pageImage, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(scrollView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        errorView = new TextView(this);
        errorView.setTextColor(Color.parseColor("#475569"));
        errorView.setTextSize(16);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(dp(24), dp(24), dp(24), dp(24));
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    }

    private void buildBottomBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.WHITE);
        bar.setPadding(dp(8), dp(6), dp(8), dp(6));

        previousButton = new Button(this);
        previousButton.setText("Anterior");
        previousButton.setAllCaps(false);
        previousButton.setEnabled(false);
        previousButton.setOnClickListener(v -> {
            if (pageIndex > 0) {
                pageIndex -= 1;
                renderPage();
            }
        });
        bar.addView(previousButton, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));

        nextButton = new Button(this);
        nextButton.setText("Seguinte");
        nextButton.setAllCaps(false);
        nextButton.setEnabled(false);
        nextButton.setOnClickListener(v -> {
            if (pageIndex < pageCount - 1) {
                pageIndex += 1;
                renderPage();
            }
        });
        bar.addView(nextButton, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));

        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private void showOptionsMenu(View anchor) {
        PopupMenu popup = new PopupMenu(this, anchor);
        popup.getMenu().add(0, 1, 0, "Partilhar");
        popup.getMenu().add(0, 2, 1, "Guardar em Downloads");
        popup.getMenu().add(0, 3, 2, "Abrir noutra aplicação");
        popup.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case 1: sharePdf(); return true;
                case 2: savePdf(); return true;
                case 3: openExternally(); return true;
                default: return false;
            }
        });
        popup.show();
    }

    private void sharePdf() {
        if (pdfUri == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/pdf");
            intent.putExtra(Intent.EXTRA_STREAM, pdfUri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, "Partilhar PDF"));
        } catch (Exception e) {
            toast("Não foi possível partilhar este PDF.");
        }
    }

    private void openExternally() {
        if (pdfUri == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(pdfUri, "application/pdf");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(intent);
        } catch (Exception e) {
            toast("Nenhuma aplicação de PDF instalada.");
        }
    }

    private void savePdf() {
        if (pdfUri == null) return;
        String name = TextUtils.isEmpty(pdfTitle) ? "documento" : pdfTitle;
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (name.isEmpty()) name = "documento";
        if (!name.toLowerCase(Locale.ROOT).endsWith(".pdf")) name += ".pdf";
        InputStream input = null;
        OutputStream output = null;
        try {
            input = getContentResolver().openInputStream(pdfUri);
            if (input == null) throw new IOException("Sem acesso ao ficheiro.");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (target == null) throw new IOException("Sem destino.");
                output = getContentResolver().openOutputStream(target);
            } else {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getFilesDir();
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Sem pasta.");
                output = new FileOutputStream(new File(dir, name));
            }
            if (output == null) throw new IOException("Sem destino.");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) > 0) {
                output.write(buffer, 0, read);
            }
            output.flush();
            toast(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? "Guardado em Downloads: " + name : "Guardado em " + name);
        } catch (Exception e) {
            toast("Não foi possível guardar o PDF.");
        } finally {
            try { if (output != null) output.close(); } catch (Exception ignored) {}
            try { if (input != null) input.close(); } catch (Exception ignored) {}
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private void openPdf(Uri uri) {
        loadingBar.setVisibility(View.VISIBLE);
        try {
            descriptor = getContentResolver().openFileDescriptor(uri, "r");
            if (descriptor == null) throw new IOException("PDF indisponível.");
            renderer = new PdfRenderer(descriptor);
            pageCount = renderer.getPageCount();
            if (pageCount <= 0) throw new IOException("PDF sem páginas.");
            pageIndex = 0;
            renderPage();
        } catch (Exception e) {
            showError("Não foi possível abrir este PDF.");
        }
    }

    private void renderPage() {
        if (renderer == null) return;
        PdfRenderer.Page page = null;
        try {
            if (currentBitmap != null) {
                pageImage.setImageDrawable(null);
                currentBitmap.recycle();
                currentBitmap = null;
            }
            page = renderer.openPage(pageIndex);
            int width = Math.max(dp(320), getResources().getDisplayMetrics().widthPixels - dp(48));
            int height = Math.max(1, Math.round(width * (float) page.getHeight() / Math.max(1, page.getWidth())));
            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(Color.WHITE);
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            currentBitmap = bitmap;
            pageImage.setImageBitmap(bitmap);
            pageImage.setVisibility(View.VISIBLE);
            scrollView.setVisibility(View.VISIBLE);
            errorView.setVisibility(View.GONE);
            pageLabel.setText("Página " + (pageIndex + 1) + " de " + pageCount);
            previousButton.setEnabled(pageIndex > 0);
            nextButton.setEnabled(pageIndex < pageCount - 1);
            scrollView.scrollTo(0, 0);
        } catch (Exception e) {
            showError("Não foi possível mostrar esta página.");
        } finally {
            if (page != null) page.close();
            loadingBar.setVisibility(View.GONE);
        }
    }

    private void showError(String message) {
        if (currentBitmap != null) {
            currentBitmap.recycle();
            currentBitmap = null;
        }
        if (pageImage != null) pageImage.setVisibility(View.GONE);
        if (scrollView != null) scrollView.setVisibility(View.GONE);
        if (errorView != null) {
            errorView.setText(message);
            errorView.setVisibility(View.VISIBLE);
        }
        if (pageLabel != null) pageLabel.setText("");
        if (previousButton != null) previousButton.setEnabled(false);
        if (nextButton != null) nextButton.setEnabled(false);
        loadingBar.setVisibility(View.GONE);
    }

    @Override
    protected void onDestroy() {
        if (currentBitmap != null) {
            currentBitmap.recycle();
            currentBitmap = null;
        }
        if (renderer != null) {
            try { renderer.close(); } catch (Exception ignored) {}
            renderer = null;
        }
        if (descriptor != null) {
            try { descriptor.close(); } catch (Exception ignored) {}
            descriptor = null;
        }
        super.onDestroy();
    }
}
