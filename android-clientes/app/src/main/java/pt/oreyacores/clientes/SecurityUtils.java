package pt.oreyacores.clientes;

import android.content.Context;
import java.io.File;

/**
 * Deteção de root / tampering (versão partilhada com a app técnicos).
 */
public class SecurityUtils {

    private static final String[] ROOT_BINARIES = {
            "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/su",
            "/system/bin/.ext/.su", "/data/local/su", "/data/local/bin/su", "/data/local/xbin/su"
    };

    private static final String[] ROOT_PACKAGES = {
            "com.noshufou.android.su", "com.thirdparty.superuser", "eu.chainfire.supersu",
            "com.koushikdutta.superuser", "com.zachspong.temprootremovejb",
            "com.devadvance.rootcloak", "de.robv.android.xposed.installer",
            "com.saurik.substrate", "com.topjohnwu.magisk"
    };

    public static boolean isDeviceRooted(Context context) {
        for (String path : ROOT_BINARIES) {
            if (new File(path).exists()) return true;
        }
        android.content.pm.PackageManager pm = context.getPackageManager();
        for (String pkg : ROOT_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return true;
            } catch (Exception ignored) {}
        }
        String tags = android.os.Build.TAGS;
        return tags != null && tags.contains("test-keys");
    }
}
