package pt.oreyacores.tecnicos;

import androidx.room.Entity;
import androidx.room.PrimaryKey;

/**
 * Anexo (foto, assinatura, PDF) ligado a uma sessão.
 */
@Entity(tableName = "attachments")
public class AttachmentEntity {
    @PrimaryKey(autoGenerate = true)
    public long id;
    public String sessionId;
    public String filePath;
    public String mimeType;
    public double latitude;
    public double longitude;
    public long timestamp;
    public boolean syncPending;
}
