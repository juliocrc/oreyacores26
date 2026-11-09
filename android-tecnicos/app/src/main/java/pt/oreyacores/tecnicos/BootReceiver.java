package pt.oreyacores.tecnicos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/**
 * Ao ligar o dispositivo, agenda a sincronização periódica de dados offline.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Não agendar sincronização enquanto não estiver implementada.
    }
}
