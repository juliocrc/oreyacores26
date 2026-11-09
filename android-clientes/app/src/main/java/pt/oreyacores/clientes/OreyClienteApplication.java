package pt.oreyacores.clientes;

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
 * Application base do cliente: inicializa Firebase, Sentry, tema escuro e Remote Config.
 */
public class OreyClienteApplication extends Application {

    public static final String PREFS_NAME = "orey_cliente_prefs";
    public static final String KEY_DARK_MODE = "dark_mode";
    public static final String KEY_HIGH_CONTRAST = "high_contrast";
    public static final String KEY_FCM_TOKEN = "fcm_token";
    public static final String KEY_MIN_VERSION = "min_version_code";

    private FirebaseAnalytics analytics;

    @Override
    public void onCreate() {
        super.onCreate();

        applyThemeFromPrefs();

        if (FirebaseApp.initializeApp(this) == null) return;
        analytics = FirebaseAnalytics.getInstance(this);

        // Remote Config
        FirebaseRemoteConfig remoteConfig = FirebaseRemoteConfig.getInstance();
        FirebaseRemoteConfigSettings configSettings = new FirebaseRemoteConfigSettings.Builder()
                .setMinimumFetchIntervalInSeconds(3600)
                .build();
        remoteConfig.setConfigSettingsAsync(configSettings);
        remoteConfig.setDefaultsAsync(R.xml.remote_config_defaults);
        remoteConfig.fetchAndActivate();

        int minVersion = (int) remoteConfig.getLong("min_version_code");
        if (minVersion > 0) {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit()
                    .putInt(KEY_MIN_VERSION, minVersion)
                    .apply();
        }

        // Token FCM
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful() && task.getResult() != null) {
                        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                                .edit()
                                .putString(KEY_FCM_TOKEN, task.getResult())
                                .apply();
                    }
                });

        // Sentry
    }

    public FirebaseAnalytics getAnalytics() {
        return analytics;
    }

    public void applyThemeFromPrefs() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        boolean dark = prefs.getBoolean(KEY_DARK_MODE, false);
        boolean highContrast = prefs.getBoolean(KEY_HIGH_CONTRAST, false);

        if (highContrast) {
            setTheme(R.style.Theme_OreyCliente_HighContrast);
        }

        AppCompatDelegate.setDefaultNightMode(
                dark ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
    }

    public static void logEvent(Application app, String eventName) {
        if (app instanceof OreyClienteApplication && ((OreyClienteApplication) app).analytics != null) {
            ((OreyClienteApplication) app).analytics.logEvent(eventName, null);
        }
    }
}
