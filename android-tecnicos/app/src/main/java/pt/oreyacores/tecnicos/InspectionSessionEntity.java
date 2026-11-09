package pt.oreyacores.tecnicos;

import androidx.room.Entity;
import androidx.room.PrimaryKey;
import androidx.annotation.NonNull;

/**
 * Sessão de inspeção persistida localmente (offline-first).
 */
@Entity(tableName = "inspection_sessions")
public class InspectionSessionEntity {
    @PrimaryKey
    @NonNull
    public String sessionId;
    public String status;          // PRE_TEST, TEST, COMPLETED, PAUSED
    public long startedAt;
    public long updatedAt;
    public boolean syncPending;
}
