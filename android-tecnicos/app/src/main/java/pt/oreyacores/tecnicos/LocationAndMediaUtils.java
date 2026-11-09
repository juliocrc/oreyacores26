package pt.oreyacores.tecnicos;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.location.Location;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.OnSuccessListener;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Utilitários de localização GPS e compressão de imagens.
 */
public class LocationAndMediaUtils {

    private final Context context;
    private final FusedLocationProviderClient fusedLocationClient;

    public LocationAndMediaUtils(Context context) {
        this.context = context.getApplicationContext();
        this.fusedLocationClient = LocationServices.getFusedLocationProviderClient(context);
    }

    public void getLastLocation(OnSuccessListener<Location> listener) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        fusedLocationClient.getLastLocation().addOnSuccessListener(listener);
    }

    /**
     * Comprime uma imagem para ~70% qualidade JPEG, reduzindo drasticamente o tamanho.
     * Útil antes de upload em redes 4G fracas.
     */
    public static File compressImage(File source, File destDir, int quality) throws IOException {
        if (!destDir.exists()) destDir.mkdirs();
        File dest = new File(destDir, "compressed_" + System.currentTimeMillis() + ".jpg");

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 2; // reduz resolução pela metade
        Bitmap bitmap = BitmapFactory.decodeStream(new FileInputStream(source), null, options);
        if (bitmap == null) throw new IOException("Não foi possível ler a imagem.");

        try (FileOutputStream out = new FileOutputStream(dest)) {
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out);
        }
        bitmap.recycle();
        return dest;
    }
}
