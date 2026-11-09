package pt.oreyacores.tecnicos;

import android.Manifest;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.provider.ContactsContract;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
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
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.os.CountDownTimer;
import com.google.android.material.snackbar.Snackbar;


import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.fragment.app.FragmentActivity;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends FragmentActivity {
    private static final String DEFAULT_APP_URL = "https://oreyacoresdeluxe.vercel.app/";
    private static final long LOCK_TIMEOUT_MS = 5 * 60 * 1000;
    private static final String APP_URL = stationAppUrl();
    private static final String APP_HOST = hostFromUrl(APP_URL);

    private static String stationAppUrl() {
        if (BuildConfig.STATION_BUILD) {
            String configured = BuildConfig.STATION_SERVER_URL;
            if (configured != null && !configured.trim().isEmpty()) {
                return configured.endsWith("/") ? configured : configured + "/";
            }
        }
        return DEFAULT_APP_URL;
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

    private static final int REQ_FILE = 100;
    private static final int REQ_CAMERA = 101;
    private static final int REQ_CAMERA_PERMISSION = 102;
    private static final int REQ_MEDIA_PERMISSIONS = 103;
    private static final int REQ_SPEECH_PERMISSION = 104;
    private static final int REQ_BLUETOOTH_PERMISSION = 105;
    private static final int REQ_CONTACTS_PERMISSION = 106;

    /**
     * Preenche a Web Speech API dentro do WebView. O WebView do Android não
     * implementa SpeechRecognition, por isso ligamos a interface JavaScript
     * usada pela Julia ao SpeechRecognizer nativo.
     */
    private static final String SPEECH_SHIM_JS = """
            (function () {
              if (window.SpeechRecognition || window.webkitSpeechRecognition) return;
              var bridge = window.OreyAndroid;
              if (!bridge || typeof bridge.startSpeechRecognition !== "function") return;

              var active = null;

              function finish(self) {
                if (!self || self.__finished) return;
                self.__finished = true;
                try { if (typeof self.onend === "function") self.onend(); } catch (e) {}
              }

              function deliver(id, text, final, error) {
                if (!active || active.__id !== id) return;
                var self = active;
                if (error) {
                  if (!self.__finished) {
                    if (typeof self.onerror === "function") self.onerror({ error: error });
                    finish(self);
                  }
                  active = null;
                  return;
                }
                if (text != null && text !== "" && (self.interimResults || final)) {
                  try {
                    if (typeof self.onresult === "function") {
                      self.onresult({ results: [[{ transcript: text }]], isFinal: final });
                    }
                  } catch (e) {}
                }
                if (final) {
                  finish(self);
                  active = null;
                }
              }

              window.__oreySpeechResult = deliver;

              function NativeSpeechRecognition() {
                this.lang = "pt-PT";
                this.continuous = false;
                this.interimResults = false;
                this.maxAlternatives = 1;
                this.onstart = null;
                this.onend = null;
                this.onerror = null;
                this.onresult = null;
                this.__id = null;
                this.__finished = false;
              }

              NativeSpeechRecognition.prototype.start = function () {
                if (active && active !== this) {
                  try { active.abort(); } catch (e) {}
                }
                active = this;
                this.__finished = false;
                this.__id = "speech-" + Date.now().toString(36) + "-" +
                  Math.random().toString(36).slice(2, 7);
                try {
                  if (typeof this.onstart === "function") this.onstart();
                  bridge.startSpeechRecognition(this.__id);
                } catch (e) {
                  deliver(this.__id, null, true, "client");
                }
              };

              NativeSpeechRecognition.prototype.stop = function () {
                if (active === this) {
                  try { bridge.stopSpeechRecognition(); } catch (e) {}
                }
              };

              NativeSpeechRecognition.prototype.abort = function () {
                this.stop();
                this.__finished = true;
                active = null;
                try { if (typeof this.onend === "function") this.onend(); } catch (e) {}
              };

              window.SpeechRecognition = NativeSpeechRecognition;
              window.webkitSpeechRecognition = NativeSpeechRecognition;
            })();
            """;

    private WebView webView;
    private ProgressBar progressBar;
    private FrameLayout root;
    private View offlineView;

    private View lockView;
    private boolean authenticating;
    private long backgroundAt;
    private long lastUnlockAt;

    private ValueCallback<Uri[]> fileCallback;
    private boolean fileChooserMultiple;
    private boolean fileChooserCapture;
    private boolean cameraPermissionDenied;
    private String[] fileChooserAcceptTypes = new String[0];

    private Uri pendingCameraUri;
    private File pendingCameraFile;

    private PermissionRequest pendingWebPermissionRequest;
    private String[] pendingWebPermissionResources;

    private SpeechRecognizer speechRecognizer;
    private String speechRequestId;
    private boolean speechResultDelivered;
    private String pendingSpeechRequestId;

    private TextToSpeech textToSpeech;
    private boolean ttsInitialized;
    private boolean ttsReady;
    private String pendingTtsText;
    private String pendingTtsRequestId;

    private Object backCallback;

    private TextRecognizer textRecognizer;

    // ---- Timer para inspeção ----
    private static final long PRE_TEST_DURATION_MS = 30 * 60 * 1000L;
    private static final long TEST_DURATION_MS = 60 * 60 * 1000L;
    private CountDownTimer inspectionTimer;


    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);


        // Verificação de versão mínima (forced update via Remote Config)
        int minVersion = getSharedPreferences(OreyApplication.PREFS_NAME, MODE_PRIVATE)
                .getInt(OreyApplication.KEY_MIN_VERSION, 0);
        int currentVersion;
        try {
            currentVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {
            currentVersion = BuildConfig.VERSION_CODE;
        }
        if (minVersion > 0 && currentVersion < minVersion) {
            new AlertDialog.Builder(this)
                    .setTitle("Atualização necessária")
                    .setMessage(R.string.update_required)
                    .setCancelable(false)
                    .setPositiveButton(R.string.update_now, (d, w) -> {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW,
                                    android.net.Uri.parse("market://details?id=" + getPackageName())));
                        } catch (Exception e) {
                            startActivity(new Intent(Intent.ACTION_VIEW,
                                    android.net.Uri.parse("https://oreyacoresdeluxe.vercel.app/download")));
                        }
                    })
                    .show();
            return;
        }

        // Android 15/16 desenha a aplicação de ponta a ponta. Aplicamos as
        // margens do sistema ao contentor para o conteúdo não ficar por baixo
        // da barra de estado, da navegação ou do recorte do ecrã.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        initializeTextToSpeech();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#6D28D9"));

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
            // Volta ao dashboard da app
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
        progressBar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#5B21B6")));
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

        // APK de estação: fixa a estação ativa no arranque. A conta do técnico
        // continua a ser validada pelo servidor e pode ser suspensa.
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

        cleanupOldCameraFiles();
    }

    private int dp(int value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
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

    private String initialUrl() {
        Intent intent = getIntent();
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "https".equalsIgnoreCase(data.getScheme())) {
            return data.toString();
        }
        return APP_URL;
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
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " OreyTecnicosAndroid/2.3");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.setBackgroundColor(Color.WHITE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new OreyBridge(), "OreyAndroid");
        webView.addJavascriptInterface(new Object(){
            @android.webkit.JavascriptInterface
            public void startTimer(String type){
                startInspectionTimer(type);
            }
        }, "OreyTimer");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternalIfNeeded(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternalIfNeeded(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                hideOfflineView();
                progressBar.setVisibility(View.VISIBLE);
                progressBar.setProgress(0);
                injectSpeechRecognitionShim();
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectSpeechRecognitionShim();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                injectSpeechRecognitionShim();
                // Repetir após a hidratação da página, caso a primeira injeção
                // tenha acontecido antes de a aplicação estar pronta.
                webView.postDelayed(MainActivity.this::injectSpeechRecognitionShim, 600);
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
                // Este overload também é chamado para sub-recursos em versões
                // antigas; só mostramos o ecrã offline se falhar a página.
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
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }

                fileCallback = callback;
                fileChooserMultiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                fileChooserAcceptTypes = params.getAcceptTypes() == null
                        ? new String[0]
                        : params.getAcceptTypes();
                fileChooserCapture = params.isCaptureEnabled();

                if (fileChooserCapture && acceptsImages()) {
                    launchCameraOrRequestPermission();
                } else if (acceptsImages()) {
                    showFileSourceDialog();
                } else {
                    launchFilePicker();
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                handleWebPermissionRequest(request);
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermissionRequest == request) {
                    pendingWebPermissionRequest = null;
                    pendingWebPermissionResources = null;
                }
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
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                downloadBlob(url, mimeType);
            } else {
                downloadWithManager(url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Ligações externas e deep links                                     */
    /* ------------------------------------------------------------------ */

    private boolean openExternalIfNeeded(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);

        if ("about".equals(scheme) || "javascript".equals(scheme)
                || "blob".equals(scheme) || "data".equals(scheme)) {
            return false;
        }

        if ("https".equals(scheme) || "http".equals(scheme)) {
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (APP_HOST.equals(host)) return false;
            openExternally(uri);
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

    private void openExternally(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            toast("Não foi possível abrir a ligação.");
        }
    }

    /* ------------------------------------------------------------------ */
    /* Permissões WebView (getUserMedia: câmara e microfone)              */
    /* ------------------------------------------------------------------ */

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (request == null) return;

        String[] resources = request.getResources();
        if (resources == null || resources.length == 0) {
            request.deny();
            return;
        }

        boolean wantsVideo = false;
        boolean wantsAudio = false;
        for (String resource : resources) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                wantsVideo = true;
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                wantsAudio = true;
            }
        }

        if (!wantsVideo && !wantsAudio) {
            request.deny();
            return;
        }

        List<String> missing = new ArrayList<>();
        if (wantsVideo && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.CAMERA);
        }
        if (wantsAudio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.RECORD_AUDIO);
        }

        if (missing.isEmpty()) {
            request.grant(resources);
            return;
        }

        if (pendingWebPermissionRequest != null) {
            pendingWebPermissionRequest.deny();
        }
        pendingWebPermissionRequest = request;
        pendingWebPermissionResources = resources;
        requestPermissions(missing.toArray(new String[0]), REQ_MEDIA_PERMISSIONS);
    }

    private boolean allPermissionsGranted(String[] permissions) {
        if (permissions == null) return false;
        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    /* ------------------------------------------------------------------ */
    /* Ditado nativo (SpeechRecognizer) para a Julia                      */
    /* ------------------------------------------------------------------ */

    private void injectSpeechRecognitionShim() {
        if (webView == null) return;
        String url = webView.getUrl();
        if (url == null || !url.contains(APP_HOST)) return;
        webView.evaluateJavascript(SPEECH_SHIM_JS, null);
    }

    private void startNativeSpeech(String requestId) {
        if (requestId == null || requestId.isEmpty()) return;

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingSpeechRequestId = requestId;
            requestPermissions(
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    REQ_SPEECH_PERMISSION);
            return;
        }

        startNativeSpeechNow(requestId);
    }

    private void startNativeSpeechNow(String requestId) {
        if (requestId == null || requestId.isEmpty()) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendSpeechResult(requestId, null, true, "unsupported");
            return;
        }

        stopNativeSpeech();

        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            speechRecognizer.setRecognitionListener(new NativeSpeechListener());
        }

        speechRequestId = requestId;
        speechResultDelivered = false;

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-PT");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-PT");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

        try {
            speechRecognizer.startListening(intent);
        } catch (Exception error) {
            speechRequestId = null;
            sendSpeechResult(requestId, null, true, "client");
        }
    }

    private void stopNativeSpeech() {
        String requestId = speechRequestId;
        speechRequestId = null;
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
            } catch (Exception ignored) {
                // O reconhecedor pode já ter terminado.
            }
        }
        if (requestId != null && !speechResultDelivered) {
            sendSpeechResult(requestId, null, true, "aborted");
        }
    }

    private void sendSpeechResult(String requestId, String text, boolean finalResult, String error) {
        if (requestId == null) return;
        runOnUiThread(() -> {
            if (webView == null) return;
            String script = "window.__oreySpeechResult && window.__oreySpeechResult("
                    + JSONObject.quote(requestId) + ","
                    + (text == null ? "null" : JSONObject.quote(text)) + ","
                    + finalResult + ","
                    + (error == null ? "null" : JSONObject.quote(error)) + ");";
            webView.evaluateJavascript(script, null);
        });
    }

    private String mapSpeechError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_CLIENT:
                return "client";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "not-allowed";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "network";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no-speech";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
            case SpeechRecognizer.ERROR_TOO_MANY_REQUESTS:
                return "busy";
            case SpeechRecognizer.ERROR_SERVER:
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
            case SpeechRecognizer.ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS:
                return "server";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
            case SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT:
                return "unsupported";
            default:
                return "unknown";
        }
    }

    private class NativeSpeechListener implements RecognitionListener {
        @Override
        public void onReadyForSpeech(Bundle params) {
            // A interface já mostra o estado "a ouvir".
        }

        @Override
        public void onBeginningOfSpeech() {
        }

        @Override
        public void onRmsChanged(float rmsdB) {
        }

        @Override
        public void onBufferReceived(byte[] buffer) {
        }

        @Override
        public void onEndOfSpeech() {
        }

        @Override
        public void onError(int error) {
            String requestId = speechRequestId;
            if (requestId == null || speechResultDelivered) return;
            speechResultDelivered = true;
            speechRequestId = null;
            sendSpeechResult(requestId, null, true, mapSpeechError(error));
        }

        @Override
        public void onResults(Bundle results) {
            String requestId = speechRequestId;
            if (requestId == null || speechResultDelivered) return;
            speechResultDelivered = true;
            speechRequestId = null;

            ArrayList<String> matches = results == null
                    ? null
                    : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            String text = matches != null && !matches.isEmpty() ? matches.get(0) : null;
            if (text == null || text.trim().isEmpty()) {
                sendSpeechResult(requestId, null, true, "no-speech");
            } else {
                sendSpeechResult(requestId, text, true, null);
            }
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            String requestId = speechRequestId;
            if (requestId == null || speechResultDelivered) return;

            ArrayList<String> matches = partialResults == null
                    ? null
                    : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            String text = matches != null && !matches.isEmpty() ? matches.get(0) : null;
            if (text != null && !text.trim().isEmpty()) {
                sendSpeechResult(requestId, text, false, null);
            }
        }

        @Override
        public void onEvent(int eventType, Bundle params) {
        }
    }

    /* ------------------------------------------------------------------ */
    /* Voz nativa (TextToSpeech) para a Julia                             */
    /* ------------------------------------------------------------------ */

    private void initializeTextToSpeech() {
        try {
            textToSpeech = new TextToSpeech(this, status -> {
            ttsInitialized = true;
            if (status != TextToSpeech.SUCCESS || textToSpeech == null) {
                ttsReady = false;
                if (pendingTtsRequestId != null) {
                    sendTtsEvent(pendingTtsRequestId, "error", "unavailable");
                }
                pendingTtsText = null;
                pendingTtsRequestId = null;
                return;
            }

            int languageResult = textToSpeech.setLanguage(new Locale("pt", "PT"));
            if (languageResult == TextToSpeech.LANG_MISSING_DATA
                    || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                languageResult = textToSpeech.setLanguage(new Locale("pt", "BR"));
            }
            ttsReady = languageResult != TextToSpeech.LANG_MISSING_DATA
                    && languageResult != TextToSpeech.LANG_NOT_SUPPORTED;
            if (!ttsReady) {
                if (pendingTtsRequestId != null) {
                    sendTtsEvent(pendingTtsRequestId, "error", "unavailable");
                }
                pendingTtsText = null;
                pendingTtsRequestId = null;
                return;
            }

            textToSpeech.setSpeechRate(1.02f);
            textToSpeech.setPitch(1.0f);
            textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    sendTtsEvent(utteranceId, "start", null);
                }

                @Override
                public void onDone(String utteranceId) {
                    sendTtsEvent(utteranceId, "done", null);
                }

                @Override
                public void onError(String utteranceId) {
                    sendTtsEvent(utteranceId, "error", "tts-error");
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    sendTtsEvent(utteranceId, "error", "tts-" + errorCode);
                }
            });

            if (pendingTtsText != null && pendingTtsRequestId != null) {
                String text = pendingTtsText;
                String requestId = pendingTtsRequestId;
                pendingTtsText = null;
                pendingTtsRequestId = null;
                speakNativeText(text, requestId);
            }
            });
        } catch (Exception error) {
            ttsInitialized = true;
            ttsReady = false;
            textToSpeech = null;
            if (pendingTtsRequestId != null) {
                sendTtsEvent(pendingTtsRequestId, "error", "unavailable");
            }
            pendingTtsText = null;
            pendingTtsRequestId = null;
        }
    }

    private void speakNativeText(String text, String requestId) {
        String clean = text == null ? "" : text.trim();
        if (clean.isEmpty()) {
            sendTtsEvent(requestId, "error", "empty");
            return;
        }
        if (clean.length() > 1_200) clean = clean.substring(0, 1_200);

        if (textToSpeech == null || !ttsReady) {
            if (!ttsInitialized) {
                pendingTtsText = clean;
                pendingTtsRequestId = requestId;
            } else {
                sendTtsEvent(requestId, "error", "unavailable");
            }
            return;
        }

        String utteranceId = requestId == null || requestId.isEmpty()
                ? "tts-" + System.currentTimeMillis()
                : requestId;

        try {
            textToSpeech.stop();
            int result = textToSpeech.speak(
                    clean,
                    TextToSpeech.QUEUE_FLUSH,
                    null,
                    utteranceId);
            if (result != TextToSpeech.SUCCESS) {
                sendTtsEvent(requestId, "error", "speak-failed");
            }
        } catch (Exception error) {
            sendTtsEvent(requestId, "error", "client");
        }
    }

    private void stopNativeTts() {
        pendingTtsText = null;
        pendingTtsRequestId = null;
        if (textToSpeech != null) {
            try {
                textToSpeech.stop();
            } catch (Exception ignored) {
                // O motor pode já estar parado.
            }
        }
    }

    private void sendTtsEvent(String requestId, String event, String error) {
        if (requestId == null) return;
        runOnUiThread(() -> {
            if (webView == null) return;
            String script = "window.__oreyTtsEvent && window.__oreyTtsEvent("
                    + JSONObject.quote(requestId) + ","
                    + JSONObject.quote(event) + ","
                    + (error == null ? "null" : JSONObject.quote(error)) + ");";
            webView.evaluateJavascript(script, null);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Seletor de ficheiros / câmara / galeria                            */
    /* ------------------------------------------------------------------ */

    private boolean acceptsImages() {
        if (fileChooserAcceptTypes.length == 0) return true;
        for (String raw : fileChooserAcceptTypes) {
            String accept = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
            if (accept.isEmpty() || "*/*".equals(accept) || accept.startsWith("image/")) return true;
            if (accept.contains(".jpg") || accept.contains(".jpeg") || accept.contains(".png")
                    || accept.contains(".webp") || accept.contains(".heic") || accept.contains(".heif")) {
                return true;
            }
        }
        return false;
    }

    private void showFileSourceDialog() {
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();

        if (acceptsImages()) {
            if (!cameraPermissionDenied) {
                labels.add(getString(R.string.camera_option));
                actions.add(this::launchCameraOrRequestPermission);
            }
            labels.add(getString(R.string.gallery_option));
            actions.add(this::launchGallery);
        }
        labels.add(getString(R.string.files_option));
        actions.add(this::launchFilePicker);

        if (labels.size() == 1) {
            actions.get(0).run();
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle(R.string.file_chooser_title)
                .setItems(labels.toArray(new String[0]), (dialog, which) -> actions.get(which).run())
                .setNegativeButton(android.R.string.cancel, (dialog, which) -> cancelFileChooser())
                .setOnCancelListener(dialog -> cancelFileChooser())
                .show();
    }

    private void launchCameraOrRequestPermission() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA_PERMISSION);
            return;
        }
        launchCamera();
    }

    private void launchCamera() {
        try {
            File cameraDir = new File(getCacheDir(), "camera");
            if (!cameraDir.exists() && !cameraDir.mkdirs()) {
                throw new IllegalStateException("Não foi possível preparar a pasta da câmara.");
            }

            pendingCameraFile = File.createTempFile("orey_", ".jpg", cameraDir);
            pendingCameraUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    pendingCameraFile);

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
            intent.setClipData(ClipData.newRawUri("orey-documento", pendingCameraUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(intent, REQ_CAMERA);
        } catch (ActivityNotFoundException error) {
            cleanupPendingCamera();
            toast(getString(R.string.camera_unavailable));
            showFileSourceDialog();
        } catch (Exception error) {
            cleanupPendingCamera();
            toast("Não foi possível abrir a câmara.");
            showFileSourceDialog();
        }
    }

    private void launchGallery() {
        try {
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            if (fileChooserMultiple) {
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            startActivityForResult(intent, REQ_FILE);
        } catch (ActivityNotFoundException error) {
            launchFilePicker();
        }
    }

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
            cancelFileChooser();
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
                else if (accept.equals(".heic") || accept.equals(".heif")) types.add("image/*");
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

        if (requestCode == REQ_CAMERA) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && pendingCameraUri != null
                    && pendingCameraFile != null && pendingCameraFile.length() > 0) {
                result = new Uri[]{pendingCameraUri};
            } else {
                cleanupPendingCamera();
            }
            finishFileChooser(result);
            return;
        }

        if (requestCode == REQ_FILE) {
            finishFileChooser(resultCode == RESULT_OK ? extractUris(data) : null);
        }
    }

    private void finishFileChooser(Uri[] uris) {
        ValueCallback<Uri[]> callback = fileCallback;
        fileCallback = null;
        fileChooserMultiple = false;
        fileChooserCapture = false;
        fileChooserAcceptTypes = new String[0];
        pendingCameraUri = null;
        pendingCameraFile = null;

        if (callback != null) {
            callback.onReceiveValue(uris);
        }
    }

    private void cancelFileChooser() {
        cleanupPendingCamera();
        finishFileChooser(null);
    }

    private void cleanupPendingCamera() {
        if (pendingCameraFile != null && pendingCameraFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            pendingCameraFile.delete();
        }
        pendingCameraFile = null;
        pendingCameraUri = null;
    }

    private void cleanupOldCameraFiles() {
        File cameraDir = new File(getCacheDir(), "camera");
        File[] files = cameraDir.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 2L * 24L * 60L * 60L * 1000L;
        for (File file : files) {
            if (file.lastModified() < cutoff) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQ_CAMERA_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                launchCamera();
            } else {
                cameraPermissionDenied = true;
                toast(getString(R.string.camera_permission_denied));
                if (fileCallback != null) {
                    showFileSourceDialog();
                }
            }
            return;
        }

        if (requestCode == REQ_MEDIA_PERMISSIONS) {
            PermissionRequest request = pendingWebPermissionRequest;
            String[] resources = pendingWebPermissionResources;
            pendingWebPermissionRequest = null;
            pendingWebPermissionResources = null;
            if (request == null) return;

            if (allPermissionsGranted(permissions)) {
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    cameraPermissionDenied = false;
                }
                request.grant(resources);
            } else {
                request.deny();
                toast("Permissão de câmara/microfone negada. Autorize nas definições da aplicação.");
            }
            return;
        }

        if (requestCode == REQ_SPEECH_PERMISSION) {
            String requestId = pendingSpeechRequestId;
            pendingSpeechRequestId = null;
            if (allPermissionsGranted(permissions)) {
                startNativeSpeechNow(requestId);
            } else {
                sendSpeechResult(requestId, null, true, "not-allowed");
                toast("Permissão do microfone negada. Autorize nas definições da aplicação.");
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* OCR nativo (ML Kit)                                                */
    /* ------------------------------------------------------------------ */

    private class OreyBridge {
        @JavascriptInterface
        public void ocrImage(String base64, String requestId) {
            if (requestId == null || requestId.isEmpty()) return;

            try {
                if (!base64ContainsImage(base64)) {
                    sendOcrResult(requestId, null, "Imagem vazia.");
                    return;
                }

                int comma = base64.indexOf(',');
                String payload = comma >= 0 ? base64.substring(comma + 1) : base64;
                byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) {
                    sendOcrResult(requestId, null, "Não foi possível ler a imagem.");
                    return;
                }

                if (textRecognizer == null) {
                    bitmap.recycle();
                    sendOcrResult(requestId, null, "Motor de OCR indisponível.");
                    return;
                }

                InputImage image = InputImage.fromBitmap(bitmap, 0);
                textRecognizer.process(image)
                        .addOnSuccessListener(result -> sendOcrResult(requestId, result.getText(), null))
                        .addOnFailureListener(error -> sendOcrResult(
                                requestId,
                                null,
                                error.getMessage() == null ? "Falha no OCR." : error.getMessage()))
                        .addOnCompleteListener(task -> bitmap.recycle());
            } catch (Exception error) {
                sendOcrResult(requestId, null, error.getMessage());
            }
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
            showDownloadError(message);
        }

        @JavascriptInterface
        public boolean isSpeechRecognitionAvailable() {
            try {
                return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
            } catch (Exception error) {
                return false;
            }
        }

        @JavascriptInterface
        public void startSpeechRecognition(String requestId) {
            runOnUiThread(() -> startNativeSpeech(requestId));
        }

        @JavascriptInterface
        public void stopSpeechRecognition() {
            runOnUiThread(MainActivity.this::stopNativeSpeech);
        }

        @JavascriptInterface
        public void speakText(String text, String requestId) {
            runOnUiThread(() -> speakNativeText(text, requestId));
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(MainActivity.this::stopNativeTts);
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception error) {
                    toast("Não foi possível abrir as definições da aplicação.");
                }
            });
        }

        @JavascriptInterface
        public void openBluetoothSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)); }
                catch (Exception error) { toast("Não foi possível abrir as definições Bluetooth."); }
            });
        }

        @JavascriptInterface
        public void requestBluetoothAccess() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BLUETOOTH_PERMISSION);
                }
            });
        }

        @JavascriptInterface
        public String pairedBluetoothDevices() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) return "PERMISSION_REQUIRED";
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) return "[]";
                JSONArray devices = new JSONArray();
                for (BluetoothDevice device : adapter.getBondedDevices()) {
                    JSONObject item = new JSONObject();
                    item.put("name", device.getName());
                    item.put("address", device.getAddress());
                    devices.put(item);
                }
                return devices.toString();
            } catch (Exception error) { return "[]"; }
        }

        @JavascriptInterface
        public void openDialer(String rawPhone) {
            runOnUiThread(() -> {
                String phone = rawPhone == null ? "" : rawPhone.replaceAll("[^0-9+]", "");
                if (phone.replace("+", "").length() < 6) { toast("Número de telefone inválido."); return; }
                try { startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone))); }
                catch (Exception error) { toast("Não foi possível abrir o marcador."); }
            });
        }

        @JavascriptInterface
        public void composeSms(String rawPhone, String body) {
            runOnUiThread(() -> {
                String phone = rawPhone == null ? "" : rawPhone.replaceAll("[^0-9+]", "");
                if (phone.replace("+", "").length() < 6) { toast("Número de telefone inválido."); return; }
                try {
                    Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + phone));
                    intent.putExtra("sms_body", body == null ? "" : body);
                    startActivity(intent);
                } catch (Exception error) { toast("Não foi possível abrir as SMS."); }
            });
        }

        @JavascriptInterface
        public void requestContactsAccess() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, REQ_CONTACTS_PERMISSION);
                }
            });
        }

        @JavascriptInterface
        public String getContactsForImport() {
            if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return "PERMISSION_REQUIRED";
            JSONArray contacts = new JSONArray();
            String[] projection = {ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER};
            try (android.database.Cursor cursor = getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, projection, null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
                if (cursor == null) return "[]";
                while (cursor.moveToNext() && contacts.length() < 500) {
                    JSONObject item = new JSONObject();
                    item.put("id", cursor.getString(0)); item.put("name", cursor.getString(1)); item.put("phone", cursor.getString(2));
                    contacts.put(item);
                }
            } catch (Exception ignored) { }
            return contacts.toString();
        }
    }

    private boolean base64ContainsImage(String value) {
        return value != null && value.length() > 32;
    }

    private void sendOcrResult(String requestId, String text, String error) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String script = "window.__oreyOcrResult && window.__oreyOcrResult("
                    + JSONObject.quote(requestId) + ","
                    + (text == null ? "null" : JSONObject.quote(text)) + ","
                    + (error == null ? "null" : JSONObject.quote(error)) + ");";
            webView.evaluateJavascript(script, null);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Downloads (PDF/Excel gerados pela aplicação)                        */
    /* ------------------------------------------------------------------ */

    private void downloadBlob(String url, String mimeType) {
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
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            if (fileName == null || fileName.trim().isEmpty()) {
                fileName = "orey-documento-" + System.currentTimeMillis() + extensionForMime(mimeType);
            }
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);

            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
            if (userAgent != null && !userAgent.isEmpty()) request.addRequestHeader("User-Agent", userAgent);

            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("DownloadManager indisponível.");
            manager.enqueue(request);
            toast("A descarregar " + fileName);
        } catch (Exception error) {
            showDownloadError("Não foi possível descarregar o documento.");
        }
    }

    private void showDownloadError(String message) {
        runOnUiThread(() -> toast(
                message == null || message.isEmpty() ? "Falha ao descarregar." : message));
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

        File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) directory = getFilesDir();
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Não foi possível criar a pasta de downloads.");
        }

        File target = new File(directory, safeName);
        try (FileOutputStream output = new FileOutputStream(target)) {
            output.write(bytes);
        }

        final File saved = target;
        final String safeMime = mimeType == null || mimeType.isEmpty()
                ? guessMimeType(saved.getName())
                : mimeType;

        runOnUiThread(() -> showSavedDialog(saved, safeMime));
    }

    private String guessMimeType(String fileName) {
        String guessed = URLConnection.guessContentTypeFromName(fileName);
        return guessed == null ? "application/octet-stream" : guessed;
    }

    private void showSavedDialog(File file, String mimeType) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle(R.string.document_saved)
                .setMessage(file.getName())
                .setPositiveButton(R.string.open, (dialog, which) -> openFile(file, mimeType))
                .setNeutralButton(R.string.share, (dialog, which) -> shareFile(file, mimeType))
                .setNegativeButton(R.string.close, null)
                .show();
    }

    private Uri fileUri(File file) {
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
    }

    private void openFile(File file, String mimeType) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(fileUri(file), mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, getString(R.string.open)));
        } catch (ActivityNotFoundException error) {
            toast("Não foi encontrada uma aplicação para abrir o documento.");
        }
    }

    private void shareFile(File file, String mimeType) {
        try {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_STREAM, fileUri(file));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, getString(R.string.share)));
        } catch (ActivityNotFoundException error) {
            toast("Não foi encontrada uma aplicação para partilhar o documento.");
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
        overlay.setBackgroundColor(Color.parseColor("#6D28D9"));
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
        subtitle.setTextColor(Color.parseColor("#EDE9FE"));
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
        unlock.setTextColor(Color.parseColor("#6D28D9"));
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
        title.setTypeface(Typeface.DEFAULT_BOLD);
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
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // As cookies serão gravadas pelo WebView quando possível.
        }
        backgroundAt = System.currentTimeMillis();
        if (webView != null) webView.onPause();
        super.onPause();
    }

    private void startInspectionTimer(String type){
        long duration = "pre".equalsIgnoreCase(type) ? PRE_TEST_DURATION_MS : TEST_DURATION_MS;
        if (inspectionTimer != null) inspectionTimer.cancel();
        inspectionTimer = new CountDownTimer(duration, 1000) {
            @Override
            public void onTick(long millisUntilFinished) {
                // opcional: atualizar UI, por exemplo barra de progresso.
            }
            @Override
            public void onFinish() {
                // tocar alerta sonoro
                Uri alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                MediaPlayer player = MediaPlayer.create(MainActivity.this, alarm);
                if (player != null) {
                    player.setOnCompletionListener(MediaPlayer::release);
                    player.start();
                }
                Snackbar.make(root,
                        "Tempo "+(type.equalsIgnoreCase("pre")?"pré‑teste":"teste")+" esgotado",
                        Snackbar.LENGTH_LONG).show();
            }
        }.start();
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

        if (pendingWebPermissionRequest != null) {
            pendingWebPermissionRequest.deny();
            pendingWebPermissionRequest = null;
            pendingWebPermissionResources = null;
        }

        speechRequestId = null;
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
            } catch (Exception ignored) {
                // ignorar
            }
            speechRecognizer.destroy();
            speechRecognizer = null;
        }

        stopNativeTts();
        if (textToSpeech != null) {
            textToSpeech.shutdown();
            textToSpeech = null;
        }

        if (textRecognizer != null) {
            textRecognizer.close();
            textRecognizer = null;
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
