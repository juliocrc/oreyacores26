package pt.oreyacores.tecnicos;

import android.content.Context;
import android.content.SharedPreferences;
import java.security.SecureRandom;

/**
 * Gestão de handover entre turnos: gera um PIN de 6 dígitos que o
 * próximo técnico insere para continuar a mesma inspeção.
 */
public class HandoverManager {

    private static final String KEY_HANDOVER_PIN = "handover_pin";
    private static final String KEY_HANDOVER_SESSION = "handover_session";
    private static final String KEY_HANDOVER_EXPIRY = "handover_expiry";
    private static final long PIN_VALIDITY_MS = 30 * 60 * 1000L; // 30 minutos

    private final SharedPreferences prefs;

    public HandoverManager(Context context) {
        prefs = context.getSharedPreferences(OreyApplication.PREFS_NAME, Context.MODE_PRIVATE);
    }

    /** Gera um novo PIN de 6 dígitos válido por 30 minutos. */
    public String generatePin(String sessionId) {
        SecureRandom random = new SecureRandom();
        StringBuilder pin = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            pin.append(random.nextInt(10));
        }
        prefs.edit()
                .putString(KEY_HANDOVER_PIN, pin.toString())
                .putString(KEY_HANDOVER_SESSION, sessionId)
                .putLong(KEY_HANDOVER_EXPIRY, System.currentTimeMillis() + PIN_VALIDITY_MS)
                .apply();
        return pin.toString();
    }

    /** Valida o PIN inserido pelo próximo técnico. */
    public boolean validatePin(String pin, String sessionId) {
        String stored = prefs.getString(KEY_HANDOVER_PIN, null);
        String storedSession = prefs.getString(KEY_HANDOVER_SESSION, null);
        long expiry = prefs.getLong(KEY_HANDOVER_EXPIRY, 0);

        if (stored == null || System.currentTimeMillis() > expiry) return false;
        boolean valid = stored.equals(pin) && sessionId.equals(storedSession);
        if (valid) {
            // PIN usado uma única vez
            prefs.edit().remove(KEY_HANDOVER_PIN).apply();
        }
        return valid;
    }
}
