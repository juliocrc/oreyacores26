package pt.oreyacores.tecnicos;

import android.app.Application;
import android.content.SharedPreferences;
import androidx.appcompat.app.AppCompatDelegate;
import com.google.firebase.FirebaseApp;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.remoteconfig.FirebaseRemoteConfig;
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings;
import io.sentry.Sentry;

/**
 * Application base: inicializa Firebase, Sentry, tema escuro e Remote Config.
 */
public class OreyApplication extends Application {

    public static final String PREFS_NAME = "orey_prefs";
    public static final String KEY_DARK_MODE = "dark_mode";
    public static final String KEY_LOW_POWER = "low_power";
    public static final String KEY_HIGH_CONTRAST = "high_contrast";
    public static final String KEY_STATION_SLUG = "station_slug";
    public static final String KEY_FCM_TOKEN = "fcm_token";
    public static final String KEY_MIN_VERSION = "min_version_code";

    private FirebaseAnalytics analytics;

    @Override
    public void onCreate() {
        super.onCreate();

        // Tema escuro / alto contraste baseado nas preferências
        applyThemeFromPrefs();

        // Firebase
        if (FirebaseApp.initializeApp(this) == null) return;
        analytics = FirebaseAnalytics.getInstance(this);

        // Remote Config: permite alterar URL do servidor, timers, etc. sem nova versão
        FirebaseRemoteConfig remoteConfig = FirebaseRemoteConfig.getInstance();
        FirebaseRemoteConfigSettings configSettings = new FirebaseRemoteConfigSettings.Builder()
                .setMinimumFetchIntervalInSeconds(3600)
                .build();
        remoteConfig.setConfigSettingsAsync(configSettings);
        remoteConfig.setDefaultsAsync(R.xml.remote_config_defaults);
        remoteConfig.fetchAndActivate();

        // Versão mínima obrigatória (forced update)
        long minVersion = remoteConfig.getLong("min_version_code");
        if (minVersion > 0) {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit()
                    .putInt(KEY_MIN_VERSION, (int) minVersion)
                    .apply();
        }

        // Token FCM para push notifications
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful() && task.getResult() != null) {
                        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                                .edit()
                                .putString(KEY_FCM_TOKEN, task.getResult())
                                .apply();
                    }
                });

        // Sentry: monitorização de erros em produção
    }

    public FirebaseAnalytics getAnalytics() {
        return analytics;
    }

    public void applyThemeFromPrefs() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        boolean dark = prefs.getBoolean(KEY_DARK_MODE, false);
        boolean highContrast = prefs.getBoolean(KEY_HIGH_CONTRAST, false);

        if (highContrast) {
            // Tema de alto contraste usa cores preto/branco puros
            setTheme(R.style.Theme_OreyTecnicos_HighContrast);
        }

        AppCompatDelegate.setDefaultNightMode(
                dark ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
    }

    public static void logEvent(Application app, String eventName) {
        if (app instanceof OreyApplication && ((OreyApplication) app).analytics != null) {
            ((OreyApplication) app).analytics.logEvent(eventName, null);
        }
    }
}
