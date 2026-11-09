package pt.oreyacores.clientes;

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
 * Recebe push notifications para o cliente (nova fatura, proposta aprovada, etc.).
 */
public class OreyClienteMessagingService extends FirebaseMessagingService {

    public static final String CHANNEL_PORTAL = "portal";
    public static final String CHANNEL_ALERTS = "alerts";

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        String title = remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getTitle() : "Orey Açores";
        String body = remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getBody() : "";
        String type = remoteMessage.getData().get("type");
        String channelId = "alert".equals(type) ? CHANNEL_ALERTS : CHANNEL_PORTAL;
        showNotification(title, body, channelId);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences(OreyClienteApplication.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(OreyClienteApplication.KEY_FCM_TOKEN, token)
                .apply();
    }

    private void showNotification(String title, String body, String channelId) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi);

        NotificationManager mgr = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (mgr != null) mgr.notify((int) System.currentTimeMillis(), builder.build());
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager mgr = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (mgr == null) return;
            mgr.createNotificationChannel(new NotificationChannel(CHANNEL_PORTAL,
                    getString(R.string.notification_channel_portal), NotificationManager.IMPORTANCE_HIGH));
            NotificationChannel alerts = new NotificationChannel(CHANNEL_ALERTS,
                    getString(R.string.notification_channel_alerts), NotificationManager.IMPORTANCE_HIGH);
            alerts.enableVibration(true);
            mgr.createNotificationChannel(alerts);
        }
    }
}
