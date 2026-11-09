package pt.oreyacores.tecnicos;

import android.content.Context;
import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

@Database(
        entities = {
                InspectionSessionEntity.class,
                InspectionStepEntity.class,
                AttachmentEntity.class
        },
        version = 1,
        exportSchema = false)
public abstract class OreyDatabase extends RoomDatabase {

    private static volatile OreyDatabase instance;

    public abstract OreyDao oreyDao();

    public static OreyDatabase getInstance(Context context) {
        if (instance == null) {
            synchronized (OreyDatabase.class) {
                if (instance == null) {
                    instance = Room.databaseBuilder(
                                    context.getApplicationContext(),
                                    OreyDatabase.class,
                                    "orey_offline.db")
                            .build();
                }
            }
        }
        return instance;
    }
}
