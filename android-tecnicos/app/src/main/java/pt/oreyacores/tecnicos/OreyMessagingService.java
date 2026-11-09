package pt.oreyacores.tecnicos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Recebe push notifications (FCM) para alertas de inspeção,
 * fim de timer, mudanças de fase, etc.
 */
public class OreyMessagingService extends FirebaseMessagingService {

    public static final String CHANNEL_INSPECTION = "inspection";
    public static final String CHANNEL_ALERTS = "alerts";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        String title = remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getTitle() : "Orey Açores";
        String body = remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getBody() : "";
        String type = remoteMessage.getData().get("type");

        String channelId = "alert".equals(type) ? CHANNEL_ALERTS : CHANNEL_INSPECTION;
        showNotification(title, body, channelId, type);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences(OreyApplication.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(OreyApplication.KEY_FCM_TOKEN, token)
                .apply();
        // Aqui pode enviar o token para o backend
    }

    private void showNotification(String title, String body, String channelId, String type) {
        Intent intent = new Intent(this, MainActivity.class);
        if (type != null) {
            intent.putExtra("push_type", type);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify((int) System.currentTimeMillis(), builder.build());
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager == null) return;

            NotificationChannel inspection = new NotificationChannel(
                    CHANNEL_INSPECTION,
                    getString(R.string.notification_channel_inspection),
                    NotificationManager.IMPORTANCE_HIGH);
            manager.createNotificationChannel(inspection);

            NotificationChannel alerts = new NotificationChannel(
                    CHANNEL_ALERTS,
                    getString(R.string.notification_channel_alerts),
                    NotificationManager.IMPORTANCE_HIGH);
            alerts.enableVibration(true);
            manager.createNotificationChannel(alerts);
        }
    }
}
