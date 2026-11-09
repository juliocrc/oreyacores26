package pt.oreyacores.tecnicos;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.List;

/**
 * Worker que sincroniza dados offline (sessões, passos, anexos)
 * com o servidor quando há conectividade.
 */
public class SyncWorker extends Worker {

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        // A sincronização ainda não está implementada. Preservar todos os
        // registos pendentes até existir confirmação real do servidor.
        return Result.failure();
    }
}
