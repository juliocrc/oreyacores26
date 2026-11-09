package pt.oreyacores.tecnicos;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;
import androidx.room.Update;
import java.util.List;

@Dao
public interface OreyDao {

    // Sessões
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertSession(InspectionSessionEntity session);

    @Query("SELECT * FROM inspection_sessions WHERE syncPending = 1")
    List<InspectionSessionEntity> getPendingSessions();

    @Query("UPDATE inspection_sessions SET syncPending = 0 WHERE sessionId = :id")
    void markSessionSynced(String id);

    // Passos
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertStep(InspectionStepEntity step);

    @Query("SELECT * FROM inspection_steps WHERE syncPending = 1")
    List<InspectionStepEntity> getPendingSteps();

    @Query("UPDATE inspection_steps SET syncPending = 0 WHERE id = :id")
    void markStepSynced(long id);

    // Anexos
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertAttachment(AttachmentEntity attachment);

    @Query("SELECT * FROM attachments WHERE syncPending = 1")
    List<AttachmentEntity> getPendingAttachments();

    @Query("UPDATE attachments SET syncPending = 0 WHERE id = :id")
    void markAttachmentSynced(long id);

    // Limpeza de cache antigo
    @Query("DELETE FROM attachments WHERE timestamp < :cutoff")
    void deleteOldAttachments(long cutoff);
}
