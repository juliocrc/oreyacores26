package pt.oreyacores.tecnicos;

import androidx.room.Entity;
import androidx.room.PrimaryKey;

/**
 * Passo (checklist) de uma sessão de inspeção.
 */
@Entity(tableName = "inspection_steps")
public class InspectionStepEntity {
    @PrimaryKey(autoGenerate = true)
    public long id;
    public String sessionId;
    public String stepName;
    public boolean completed;
    public long timestamp;
    public boolean syncPending;
}
