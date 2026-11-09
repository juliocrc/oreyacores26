package pt.oreyacores.clientes;

import android.content.pm.PackageManager;
import android.provider.Settings;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.fragment.app.FragmentActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends FragmentActivity {
    private static final String DEFAULT_BASE_URL = "https://oreyacoresdeluxe.vercel.app/";
    private static final long LOCK_TIMEOUT_MS = 5 * 60 * 1000;
    private static final String APP_URL = stationAppUrl();
    private static final String APP_HOST = hostFromUrl(APP_URL);
    private static final int REQ_FILE = 100;

    private static String stationAppUrl() {
        String base = DEFAULT_BASE_URL;
        if (BuildConfig.STATION_BUILD) {
            String configured = BuildConfig.STATION_SERVER_URL;
            if (configured != null && !configured.trim().isEmpty()) base = configured;
        }
        if (!base.endsWith("/")) base += "/";
        return base + "area-cliente/login";
    }

    private static String hostFromUrl(String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host != null && !host.isEmpty()) return host.toLowerCase(Locale.ROOT);
        } catch (Exception ignored) {
            // Usar o host por omissão.
        }
        return "oreyacoresdeluxe.vercel.app";
    }

    private WebView webView;
    private ProgressBar progressBar;
    private FrameLayout root;
    private View offlineView;
    private WebView popupWebView;

    private View lockView;
    private boolean authenticating;
    private long backgroundAt;
    private long lastUnlockAt;

    private ValueCallback<Uri[]> fileCallback;
    private boolean fileChooserMultiple;
    private String[] fileChooserAcceptTypes = new String[0];

    private Object backCallback;

    private void applySecureFlag() {
        // Impede capturas de ecrã e pré-visualizações no gestor de apps.
        getWindow().setFlags(
                android.view.WindowManager.LayoutParams.FLAG_SECURE,
                android.view.WindowManager.LayoutParams.FLAG_SECURE);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        applySecureFlag();


        // Verificação de versão mínima (forced update via Remote Config)
        int minVersion = getSharedPreferences(OreyClienteApplication.PREFS_NAME, MODE_PRIVATE)
                .getInt(OreyClienteApplication.KEY_MIN_VERSION, 0);
        int currentVersion;
        try {
            currentVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {
            currentVersion = 1;
        }
        if (minVersion > 0 && currentVersion < minVersion) {
            android.app.AlertDialog.Builder builder = new android.app.AlertDialog.Builder(this);
            builder.setTitle("Atualização necessária");
            builder.setMessage(getString(R.string.update_required));
            builder.setCancelable(false);
            builder.setPositiveButton(R.string.update_now, (d, w) -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW,
                            android.net.Uri.parse("market://details?id=" + getPackageName())));
                } catch (Exception e) {
                    startActivity(new Intent(Intent.ACTION_VIEW,
                            android.net.Uri.parse("https://oreyacoresdeluxe.vercel.app/download")));
                }
            });
            builder.show();
            return;
        }

        // Android 15/16: desenhar de ponta a ponta e aplicar as margens do sistema.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B4F6C"));

        webView = new WebView(this);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT);
        webParams.bottomMargin = dp(48);
        root.addView(webView, webParams);

        // ---------- Botões de navegação da inspeção ----------
        LinearLayout navBar = new LinearLayout(this);
        navBar.setOrientation(LinearLayout.HORIZONTAL);
        navBar.setBackgroundColor(Color.parseColor("#66000000")); // semi‑transparente
        navBar.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams navParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(48),
                Gravity.BOTTOM);
        // Botão Recuar
        Button btnBack = new Button(this);
        btnBack.setText("⏪ Recuar");
        btnBack.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        btnBack.setOnClickListener(v -> {
            if (webView.canGoBack()) webView.goBack();
        });
        // Botão Avançar
        Button btnForward = new Button(this);
        btnForward.setText("⏭ Avançar");
        btnForward.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        btnForward.setOnClickListener(v -> {
            if (webView.canGoForward()) webView.goForward();
        });
        // Botão Dashboard
        Button btnDashboard = new Button(this);
        btnDashboard.setText("🏠 Dashboard");
        btnDashboard.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        btnDashboard.setOnClickListener(v -> {
            // Volta à página inicial / dashboard da app
            webView.loadUrl(APP_URL);
        });
        // Monta a barra
        navBar.addView(btnBack);
        navBar.addView(btnForward);
        navBar.addView(btnDashboard);
        // Botão Configurações
        Button btnSettings = new Button(this);
        btnSettings.setText("⚙️");
        btnSettings.setAllCaps(false);
        btnSettings.setBackgroundColor(Color.TRANSPARENT);
        btnSettings.setTextColor(Color.WHITE);
        btnSettings.setLayoutParams(new LinearLayout.LayoutParams(
                dp(48), ViewGroup.LayoutParams.MATCH_PARENT));
        btnSettings.setOnClickListener(v -> {
            startActivity(new Intent(MainActivity.this, SettingsActivity.class));
        });
        navBar.addView(btnSettings);
        root.addView(navBar, navParams);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        progressBar.setVisibility(View.GONE);
        progressBar.setProgressTintList(ColorStateList.valueOf(Color.WHITE));
        progressBar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#073B52")));
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3),
                Gravity.TOP);
        root.addView(progressBar, progressParams);

        setContentView(root);
        applyEdgeToEdgeInsets();
        registerBackCallback();

        configureWebView();

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        // APK de estação: o portal abre já com a estação ativa, mas o login
        // continua a ser feito com NIF e código.
        if (BuildConfig.STATION_BUILD && BuildConfig.STATION_ID > 0) {
            cookies.setCookie(
                    APP_URL,
                    "active_service_station_id=" + BuildConfig.STATION_ID
                            + "; Path=/; Max-Age=2592000; SameSite=Lax");
            cookies.flush();
        }

        if (state == null) {
            webView.loadUrl(initialUrl());
        } else {
            webView.restoreState(state);
        }

        cleanupOldPdfFiles();
    }

    private int dp(int value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
    }

    private String initialUrl() {
        Intent intent = getIntent();
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "https".equalsIgnoreCase(data.getScheme())) {
            String host = data.getHost() == null ? "" : data.getHost().toLowerCase(Locale.ROOT);
            if (APP_HOST.equals(host)) return data.toString();
        }
        return APP_URL;
    }

    private void applyEdgeToEdgeInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(
                    bars.left,
                    bars.top,
                    bars.right,
                    Math.max(bars.bottom, ime.bottom));
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    @SuppressWarnings("NewApi")
    private void registerBackCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        OnBackInvokedCallback callback = () -> {
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
            } else {
                finish();
            }
        };
        backCallback = callback;
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                callback);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " OreyClienteAndroid/1.0");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.setBackgroundColor(Color.WHITE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new OreyBridge(), "OreyAndroid");

        // Expõe window.orey com deviceInfo() para a página de login enviar o
        // dispositivo no pedido de autenticação (gestão de sessões no admin).
        webView.evaluateJavascript(
                "window.orey = { deviceInfo: function() { return OreyAndroid.deviceInfo(); } };",
                null);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                hideOfflineView();
                progressBar.setVisibility(View.VISIBLE);
                progressBar.setProgress(0);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    showOfflineView();
                }
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && view != null && failingUrl.equals(view.getUrl())) {
                    progressBar.setVisibility(View.GONE);
                    showOfflineView();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                } else {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                }
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                // File chooser desativado para a app cliente – não é necessário escolher pastas.
                // Apenas notificamos o usuário (opcional) e retornamos false para impedir a UI.
                Toast.makeText(MainActivity.this, "Envio de arquivos não suportado nesta versão.", Toast.LENGTH_SHORT).show();
                return false;
            }

            @Override
            public boolean onCreateWindow(
                    WebView view,
                    boolean isDialog,
                    boolean isUserGesture,
                    Message resultMsg) {
                final WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setJavaScriptEnabled(true);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        handleNewWindowUrl(request.getUrl());
                        popupView.post(() -> cleanupPopup(popupView));
                        return true;
                    }

                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                        handleNewWindowUrl(Uri.parse(url));
                        popupView.post(() -> cleanupPopup(popupView));
                        return true;
                    }
                });
                popupWebView = popup;

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null) return;
            Uri uri = Uri.parse(url);
            if (("https".equalsIgnoreCase(uri.getScheme()))
                    && APP_HOST.equalsIgnoreCase(uri.getHost())
                    && (looksLikePdfUrl(uri) || (mimeType != null && mimeType.toLowerCase(Locale.ROOT).contains("pdf")))) {
                openPdfFromUrl(uri);
                return;
            }
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                downloadBlob(url, mimeType);
            } else {
                downloadWithManager(url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Navegação, PDFs e links externos                                   */
    /* ------------------------------------------------------------------ */

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);

        if ("about".equals(scheme) || "javascript".equals(scheme)) return false;

        if ("https".equals(scheme) || "http".equals(scheme)) {
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!APP_HOST.equals(host)) {
                openExternally(uri);
                return true;
            }
            if (looksLikePdfUrl(uri)) {
                openPdfFromUrl(uri);
                return true;
            }
            return false;
        }

        if ("blob".equals(scheme) || "data".equals(scheme)) {
            openBlobUrl(uri.toString());
            return true;
        }

        if ("intent".equals(scheme)) {
            try {
                Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                startActivity(intent);
            } catch (Exception error) {
                toast("Não foi possível abrir a ligação.");
            }
            return true;
        }

        openExternally(uri);
        return true;
    }

    private void handleNewWindowUrl(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if ("about".equals(scheme) || "javascript".equals(scheme)) return;

        if ("blob".equals(scheme) || "data".equals(scheme)) {
            openBlobUrl(uri.toString());
            return;
        }

        if ("https".equals(scheme) || "http".equals(scheme)) {
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!APP_HOST.equals(host)) {
                openExternally(uri);
                return;
            }
            if (looksLikePdfUrl(uri)) {
                openPdfFromUrl(uri);
            } else if (webView != null) {
                webView.loadUrl(uri.toString());
            }
            return;
        }

        openExternally(uri);
    }

    private void cleanupPopup(WebView popup) {
        if (popup == null) return;
        try {
            popup.stopLoading();
            popup.destroy();
        } catch (Exception ignored) {
            // ignorar
        }
        if (popupWebView == popup) popupWebView = null;
    }

    private void openExternally(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            toast("Não foi possível abrir a ligação.");
        }
    }

    private boolean looksLikePdfUrl(Uri uri) {
        String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.ROOT);
        String query = uri.getQuery() == null ? "" : uri.getQuery().toLowerCase(Locale.ROOT);
        String combined = path + "?" + query;

        if (path.endsWith(".pdf") || combined.contains("format=pdf")) return true;
        if (path.contains("/api/portal/documentos")) return true;
        if (path.contains("/api/portal/faturas/")) return true;
        if (path.contains("/api/portal/declaracao-")) return true;
        if (path.contains("/api/certificados/pdf")) return true;
        if (path.contains("/api/publico/certificado")) return true;
        if (path.contains("/api/jangadas/")
                && (path.contains("/quadro") || path.contains("/certificado"))) {
            return true;
        }
        return false;
    }

    private String guessPdfFileName(Uri uri) {
        String guessed = URLUtil.guessFileName(uri.toString(), null, "application/pdf");
        if (guessed == null || guessed.trim().isEmpty()) {
            guessed = "documento-" + System.currentTimeMillis() + ".pdf";
        }
        return sanitizePdfName(guessed);
    }

    private void openPdfFromUrl(Uri uri) {
        if (webView == null || uri == null) return;
        String fileName = guessPdfFileName(uri);
        String script = "(function(){fetch(" + JSONObject.quote(uri.toString())
                + ",{credentials:'same-origin'})"
                + ".then(function(r){if(!r.ok)throw new Error('O documento não está disponível (HTTP '+r.status+').');return r.blob();})"
                + ".then(function(b){if(b.type&&!/pdf|octet-stream/i.test(b.type))throw new Error('O documento não é um PDF.');"
                + "var fr=new FileReader();"
                + "fr.onload=function(){OreyAndroid.openPdf(fr.result," + JSONObject.quote(fileName) + ");};"
                + "fr.onerror=function(){OreyAndroid.downloadFailed('Falha ao ler o documento.');};"
                + "fr.readAsDataURL(b);})"
                + ".catch(function(e){OreyAndroid.downloadFailed(e&&e.message?e.message:'Falha ao abrir o documento.');});"
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    private void openBlobUrl(String url) {
        if (webView == null || url == null) return;
        String script = "(function(){fetch(" + JSONObject.quote(url) + ")"
                + ".then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.blob();})"
                + ".then(function(b){var fr=new FileReader();"
                + "fr.onload=function(){"
                + "if(!b.type||/pdf|octet-stream/i.test(b.type)){"
                + "OreyAndroid.openPdf(fr.result,'documento-'+Date.now()+'.pdf');"
                + "}else{"
                + "OreyAndroid.saveDownload(fr.result,'documento-'+Date.now(),b.type||'application/octet-stream');"
                + "}};"
                + "fr.onerror=function(){OreyAndroid.downloadFailed('Falha ao ler o documento.');};"
                + "fr.readAsDataURL(b);})"
                + ".catch(function(e){OreyAndroid.downloadFailed(e&&e.message?e.message:'Falha ao descarregar.');});"
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    /* ------------------------------------------------------------------ */
    /* Seletor de ficheiros                                               */
    /* ------------------------------------------------------------------ */

    private void launchFilePicker() {
        try {
            List<String> mimeTypes = resolveMimeTypes();
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            if (mimeTypes.size() == 1) {
                intent.setType(mimeTypes.get(0));
            } else {
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toArray(new String[0]));
            }
            if (fileChooserMultiple) {
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            startActivityForResult(intent, REQ_FILE);
        } catch (ActivityNotFoundException error) {
            toast("Não foi encontrada uma aplicação para escolher ficheiros.");
            finishFileChooser(null);
        }
    }

    private List<String> resolveMimeTypes() {
        if (fileChooserAcceptTypes.length == 0) {
            return Collections.singletonList("*/*");
        }

        Set<String> types = new LinkedHashSet<>();
        boolean wildcard = false;

        for (String raw : fileChooserAcceptTypes) {
            String accept = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
            if (accept.isEmpty() || "*/*".equals(accept)) {
                wildcard = true;
                continue;
            }
            if (accept.startsWith("image/")) {
                types.add("image/*");
            } else if (accept.startsWith(".")) {
                if (accept.equals(".pdf")) types.add("application/pdf");
                else if (accept.equals(".xlsx") || accept.equals(".xlsm")) {
                    types.add("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                } else if (accept.equals(".xls")) {
                    types.add("application/vnd.ms-excel");
                } else if (accept.equals(".jpg") || accept.equals(".jpeg")) types.add("image/jpeg");
                else if (accept.equals(".png")) types.add("image/png");
                else if (accept.equals(".webp")) types.add("image/webp");
                else types.add("*/*");
            } else if (accept.contains("pdf")) {
                types.add("application/pdf");
            } else if (accept.contains("spreadsheetml") || accept.contains("xlsx")) {
                types.add("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            } else if (accept.contains("ms-excel") || accept.contains("xls")) {
                types.add("application/vnd.ms-excel");
            } else {
                types.add(accept);
            }
        }

        if (wildcard || types.isEmpty()) return Collections.singletonList("*/*");
        return new ArrayList<>(types);
    }

    private Uri[] extractUris(Intent data) {
        if (data == null) return null;
        List<Uri> uris = new ArrayList<>();
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            for (int i = 0; i < clipData.getItemCount(); i += 1) {
                Uri uri = clipData.getItemAt(i).getUri();
                if (uri != null) uris.add(uri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris.isEmpty() ? null : uris.toArray(new Uri[0]);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            finishFileChooser(resultCode == RESULT_OK ? extractUris(data) : null);
        }
    }

    private void finishFileChooser(Uri[] uris) {
        ValueCallback<Uri[]> callback = fileCallback;
        fileCallback = null;
        fileChooserMultiple = false;
        fileChooserAcceptTypes = new String[0];
        if (callback != null) callback.onReceiveValue(uris);
    }

    /* ------------------------------------------------------------------ */
    /* Downloads e PDFs                                                   */
    /* ------------------------------------------------------------------ */

    private void downloadBlob(String url, String mimeType) {
        if (webView == null) return;
        String safeMime = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType;
        String fileName = "orey-documento-" + System.currentTimeMillis() + extensionForMime(safeMime);
        String script = "(function(){fetch(" + JSONObject.quote(url) + ")"
                + ".then(function(r){return r.blob();})"
                + ".then(function(b){var fr=new FileReader();"
                + "fr.onload=function(){OreyAndroid.saveDownload(fr.result,"
                + JSONObject.quote(fileName) + "," + JSONObject.quote(safeMime) + ");};"
                + "fr.readAsDataURL(b);})"
                + ".catch(function(e){OreyAndroid.downloadFailed(e&&e.message?e.message:'Falha ao descarregar.');});"
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    private void downloadWithManager(String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            String safeMime = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType;
            String fileName = URLUtil.guessFileName(url, contentDisposition, safeMime);
            if (fileName == null || fileName.trim().isEmpty()) {
                fileName = "orey-documento-" + System.currentTimeMillis() + extensionForMime(safeMime);
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(safeMime);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            }

            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
            if (userAgent != null && !userAgent.isEmpty()) request.addRequestHeader("User-Agent", userAgent);

            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("DownloadManager indisponível.");
            manager.enqueue(request);
            toast("A descarregar " + fileName);
        } catch (Exception error) {
            toast("Não foi possível descarregar o documento.");
        }
    }

    private String extensionForMime(String mimeType) {
        String mime = mimeType == null ? "" : mimeType.toLowerCase(Locale.ROOT);
        if (mime.contains("pdf")) return ".pdf";
        if (mime.contains("spreadsheetml") || mime.contains("excel")) return ".xlsx";
        if (mime.contains("jpeg")) return ".jpg";
        if (mime.contains("png")) return ".png";
        if (mime.contains("zip")) return ".zip";
        if (mime.contains("json")) return ".json";
        if (mime.contains("csv")) return ".csv";
        return ".bin";
    }

    private void saveDataUrlToDownloads(String dataUrl, String fileName, String mimeType) throws Exception {
        if (dataUrl == null) throw new IllegalArgumentException("Conteúdo vazio.");
        int comma = dataUrl.indexOf(',');
        if (comma < 0) throw new IllegalArgumentException("Formato de download inválido.");
        byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);

        String safeName = fileName == null || fileName.trim().isEmpty()
                ? "orey-documento-" + System.currentTimeMillis() + extensionForMime(mimeType)
                : fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
        String safeMime = mimeType == null || mimeType.isEmpty()
                ? guessMimeType(safeName)
                : mimeType;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IllegalStateException("Não foi possível criar o ficheiro.");

            try (OutputStream output = getContentResolver().openOutputStream(item)) {
                if (output == null) throw new IllegalStateException("Não foi possível escrever o ficheiro.");
                output.write(bytes);
            }

            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(item, values, null, null);

            final Uri saved = item;
            runOnUiThread(() -> showSavedDialog(saved, safeName, safeMime));
            return;
        }

        File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) directory = getFilesDir();
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Não foi possível criar a pasta de downloads.");
        }

        File target = new File(directory, safeName);
        try (FileOutputStream output = new FileOutputStream(target)) {
            output.write(bytes);
        }

        final Uri saved = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                target);
        runOnUiThread(() -> showSavedDialog(saved, safeName, safeMime));
    }

    private String guessMimeType(String fileName) {
        String guessed = URLConnection.guessContentTypeFromName(fileName);
        return guessed == null ? "application/octet-stream" : guessed;
    }

    private void showSavedDialog(Uri uri, String fileName, String mimeType) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle(R.string.document_saved)
                .setMessage(fileName)
                .setPositiveButton(R.string.open, (dialog, which) -> openUri(uri, mimeType))
                .setNeutralButton(R.string.share, (dialog, which) -> shareUri(uri, mimeType))
                .setNegativeButton(R.string.close, null)
                .show();
    }

    private void openUri(Uri uri, String mimeType) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, getString(R.string.open)));
        } catch (ActivityNotFoundException error) {
            toast("Não foi encontrada uma aplicação para abrir o documento.");
        }
    }

    private void shareUri(Uri uri, String mimeType) {
        try {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, getString(R.string.share)));
        } catch (ActivityNotFoundException error) {
            toast("Não foi encontrada uma aplicação para partilhar o documento.");
        }
    }

    private String sanitizePdfName(String fileName) {
        String name = fileName == null || fileName.trim().isEmpty()
                ? "documento-" + System.currentTimeMillis() + ".pdf"
                : fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!name.toLowerCase(Locale.ROOT).endsWith(".pdf")) name += ".pdf";
        return name;
    }

    private void openPdfDataUrl(String dataUrl, String fileName) {
        try {
            if (dataUrl == null) throw new IllegalArgumentException("PDF vazio.");
            int comma = dataUrl.indexOf(',');
            if (comma < 0) throw new IllegalArgumentException("Formato de PDF inválido.");
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);

            String safeName = sanitizePdfName(fileName);
            File directory = new File(getCacheDir(), "pdf");
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IllegalStateException("Não foi possível preparar o leitor.");
            }

            File target = new File(directory, safeName);
            try (FileOutputStream output = new FileOutputStream(target)) {
                output.write(bytes);
            }

            Uri uri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    target);

            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(MainActivity.this, PdfViewerActivity.class);
                    intent.setData(uri);
                    intent.putExtra(PdfViewerActivity.EXTRA_TITLE, safeName);
                    startActivity(intent);
                } catch (Exception error) {
                    toast("Não foi possível abrir o PDF.");
                }
            });
        } catch (Exception error) {
            runOnUiThread(() -> toast("Não foi possível abrir o PDF."));
        }
    }

    private void cleanupOldPdfFiles() {
        File directory = new File(getCacheDir(), "pdf");
        File[] files = directory.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 2L * 24L * 60L * 60L * 1000L;
        for (File file : files) {
            if (file.lastModified() < cutoff) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Bridge JavaScript                                                  */
    /* ------------------------------------------------------------------ */

    private class OreyBridge {
        @JavascriptInterface
        public void openPdf(String dataUrl, String fileName) {
            openPdfDataUrl(dataUrl, fileName);
        }

        @JavascriptInterface
        public void saveDownload(String dataUrl, String fileName, String mimeType) {
            try {
                saveDataUrlToDownloads(dataUrl, fileName, mimeType);
            } catch (Exception error) {
                downloadFailed(error.getMessage());
            }
        }

        @JavascriptInterface
        public void downloadFailed(String message) {
            runOnUiThread(() -> toast(
                    message == null || message.isEmpty() ? "Falha ao descarregar." : message));
        }

        @JavascriptInterface
        public String deviceInfo() {
            try {
                JSONObject info = new JSONObject();
                info.put("deviceId", deviceId());
                info.put("app", "cliente");
                info.put("model", Build.MODEL == null ? "" : Build.MODEL);
                info.put("os", "Android " + Build.VERSION.RELEASE);
                info.put("appVersion", packageVersionName());
                if (BuildConfig.STATION_BUILD && BuildConfig.STATION_ID > 0) {
                    info.put("stationId", BuildConfig.STATION_ID);
                }
                return info.toString();
            } catch (Exception error) {
                return "{}";
            }
        }
    }

    private String deviceId() {
        try {
            String androidId = Settings.Secure.getString(
                    getContentResolver(), Settings.Secure.ANDROID_ID);
            String seed = getPackageName() + "|" + (androidId == null ? "" : androidId);
            // Identificador estável por instalação, sem revelar o ANDROID_ID.
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(seed.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 16; i++) sb.append(String.format("%02x", hash[i]));
            return sb.toString();
        } catch (Exception error) {
            return java.util.UUID.randomUUID().toString().replace("-", "");
        }
    }

    private String packageVersionName() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return getPackageManager().getPackageInfo(
                        getPackageName(), PackageManager.PackageInfoFlags.of(0)).versionName;
            }
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception error) {
            return "";
        }
    }

    /* ------------------------------------------------------------------ */
    /* Bloqueio da aplicação (biometria / PIN do dispositivo)             */
    /* ------------------------------------------------------------------ */

    private int lockAuthenticators() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        return BiometricManager.Authenticators.BIOMETRIC_WEAK;
    }

    private void maybeShowLock() {
        if (lockView != null || authenticating) return;
        try {
            int can = BiometricManager.from(this).canAuthenticate(lockAuthenticators());
            if (can != BiometricManager.BIOMETRIC_SUCCESS) return;
        } catch (Exception error) {
            return;
        }
        showLockOverlay();
    }

    private void showLockOverlay() {
        if (root == null || lockView != null) return;

        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.parseColor("#0B4F6C"));
        overlay.setClickable(true);
        overlay.setFocusable(true);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(28), dp(28), dp(28), dp(28));

        TextView title = new TextView(this);
        title.setText(getString(R.string.app_name));
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        panel.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Aplicação bloqueada");
        subtitle.setTextColor(Color.parseColor("#D7EEF5"));
        subtitle.setTextSize(15);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(8);
        panel.addView(subtitle, subtitleParams);

        Button unlock = new Button(this);
        unlock.setText("Desbloquear");
        unlock.setAllCaps(false);
        unlock.setTextColor(Color.parseColor("#0B4F6C"));
        unlock.setBackgroundColor(Color.WHITE);
        unlock.setPadding(dp(24), dp(10), dp(24), dp(10));
        unlock.setOnClickListener(view -> authenticate());
        LinearLayout.LayoutParams unlockParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        unlockParams.topMargin = dp(28);
        panel.addView(unlock, unlockParams);

        overlay.addView(panel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        root.addView(overlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        lockView = overlay;
    }

    private void hideLockOverlay() {
        if (lockView == null || root == null) return;
        root.removeView(lockView);
        lockView = null;
    }

    private void authenticate() {
        if (authenticating) return;

        try {
            authenticating = true;
            BiometricPrompt prompt = new BiometricPrompt(
                    this,
                    ContextCompat.getMainExecutor(this),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            authenticating = false;
                            lastUnlockAt = System.currentTimeMillis();
                            hideLockOverlay();
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            authenticating = false;
                            if (errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                    && errorCode != BiometricPrompt.ERROR_USER_CANCELED
                                    && errString != null
                                    && errString.length() > 0) {
                                toast(errString.toString());
                            }
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Mantém o ecrã bloqueado e permite tentar novamente.
                        }
                    });

            BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Desbloquear")
                    .setSubtitle(getString(R.string.app_name))
                    .setAllowedAuthenticators(lockAuthenticators());
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
                // Abaixo do Android 9 não há PIN/padrão no prompt: só impressão digital.
                info.setNegativeButtonText("Cancelar");
            }
            prompt.authenticate(info.build());
        } catch (Exception error) {
            authenticating = false;
            toast("Não foi possível pedir a autenticação.");
        }
    }

    /* ------------------------------------------------------------------ */
    /* Estado offline                                                     */
    /* ------------------------------------------------------------------ */

    private void showOfflineView() {
        if (offlineView != null || isFinishing()) return;

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(dp(28), dp(28), dp(28), dp(28));
        layout.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextSize(22);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.parseColor("#0F172A"));
        title.setGravity(Gravity.CENTER);
        layout.addView(title);

        TextView message = new TextView(this);
        message.setText(R.string.offline_message);
        message.setTextSize(14);
        message.setTextColor(Color.parseColor("#475569"));
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = dp(12);
        layout.addView(message, messageParams);

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setAllCaps(false);
        retry.setOnClickListener(view -> {
            hideOfflineView();
            if (webView != null) webView.reload();
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        retryParams.topMargin = dp(24);
        layout.addView(retry, retryParams);

        root.addView(layout, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        offlineView = layout;
    }

    private void hideOfflineView() {
        if (offlineView == null) return;
        root.removeView(offlineView);
        offlineView = null;
    }

    /* ------------------------------------------------------------------ */
    /* Ciclo de vida                                                      */
    /* ------------------------------------------------------------------ */

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri data = intent.getData();
        if (data != null && webView != null) {
            webView.loadUrl(data.toString());
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (webView != null) webView.saveState(state);
    }

    @Override
    protected void onPause() {
        backgroundAt = System.currentTimeMillis();
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // As cookies serão gravadas pelo WebView quando possível.
        }
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();

        long now = System.currentTimeMillis();
        if (lastUnlockAt > 0 && now - lastUnlockAt < 10_000) return;
        if (backgroundAt == 0 || now - backgroundAt > LOCK_TIMEOUT_MS) {
            maybeShowLock();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (lockView != null) {
            moveTaskToBack(true);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        hideLockOverlay();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(
                    (OnBackInvokedCallback) backCallback);
            backCallback = null;
        }

        if (popupWebView != null) {
            cleanupPopup(popupWebView);
        }

        if (webView != null) {
            webView.removeJavascriptInterface("OreyAndroid");
            if (isFinishing()) {
                root.removeView(webView);
                webView.destroy();
                webView = null;
            }
        }
        super.onDestroy();
    }
}
