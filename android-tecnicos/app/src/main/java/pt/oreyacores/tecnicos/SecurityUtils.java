package pt.oreyacores.tecnicos;

import android.content.Context;
import java.io.File;

/**
 * Deteção de root / tampering no dispositivo.
 * Verifica bins comuns de root, apps de superuser e test-keys.
 */
public class SecurityUtils {

    private static final String[] ROOT_BINARIES = {
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/su",
            "/system/bin/.ext/.su",
            "/system/usr/we-need-root/su",
            "/system/app/Superuser.apk",
            "/system/app/SuperSU.apk",
            "/data/local/su",
            "/data/local/bin/su",
            "/data/local/xbin/su"
    };

    private static final String[] ROOT_PACKAGES = {
            "com.noshufou.android.su",
            "com.thirdparty.superuser",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.zachspong.temprootremovejb",
            "com.ramdroid.appquarantine",
            "com.devadvance.rootcloak",
            "de.robv.android.xposed.installer",
            "com.saurik.substrate",
            "com.amphoras.hid atest",
            "com.devadvance.rootcloakplus",
            "com.topjohnwu.magisk"
    };

    public static boolean isDeviceRooted(Context context) {
        // Verifica binários de root
        for (String path : ROOT_BINARIES) {
            if (new File(path).exists()) return true;
        }

        // Verifica packages de root
        android.content.pm.PackageManager pm = context.getPackageManager();
        for (String pkg : ROOT_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return true;
            } catch (Exception ignored) {
                // não instalado
            }
        }

        // Verifica test-keys na build
        String buildTags = android.os.Build.TAGS;
        if (buildTags != null && buildTags.contains("test-keys")) return true;

        return false;
    }
}
