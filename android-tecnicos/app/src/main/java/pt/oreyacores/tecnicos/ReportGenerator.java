package pt.oreyacores.tecnicos;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.pdf.PdfDocument;
import android.os.Environment;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Gera um relatório PDF resumindo a inspeção:
 * cabeçalho, passos concluídos, anexos (fotos/assinatura), timestamps.
 */
public class ReportGenerator {

    public static File generateReport(Context context, String sessionId,
                                      List<InspectionStepEntity> steps,
                                      List<AttachmentEntity> attachments) throws IOException {
        File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (dir == null) dir = context.getFilesDir();
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Sem pasta de documentos.");

        String date = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.ROOT)
                .format(new Date());
        File pdfFile = new File(dir, "relatorio_" + sessionId + "_" + date + ".pdf");

        PdfDocument document = new PdfDocument();
        PdfDocument.PageInfo pageInfo = new PdfDocument.PageInfo.Builder(595, 842, 1).create();
        PdfDocument.Page page = document.startPage(pageInfo);
        Canvas canvas = page.getCanvas();

        Paint titlePaint = new Paint();
        titlePaint.setColor(Color.parseColor("#6D28D9"));
        titlePaint.setTextSize(22);
        titlePaint.setFakeBoldText(true);
        canvas.drawText("Relatório de Inspeção – Orey Açores", 40, 60, titlePaint);

        Paint textPaint = new Paint();
        textPaint.setColor(Color.BLACK);
        textPaint.setTextSize(12);

        int y = 100;
        canvas.drawText("Sessão: " + sessionId, 40, y, textPaint);
        y += 20;
        canvas.drawText("Data: " + new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ROOT)
                .format(new Date()), 40, y, textPaint);
        y += 30;

        Paint sectionPaint = new Paint();
        sectionPaint.setColor(Color.parseColor("#5B21B6"));
        sectionPaint.setTextSize(16);
        sectionPaint.setFakeBoldText(true);
        canvas.drawText("Passos concluídos", 40, y, sectionPaint);
        y += 24;

        for (InspectionStepEntity step : steps) {
            if (y > 780) {
                document.finishPage(page);
                page = document.startPage(pageInfo);
                canvas = page.getCanvas();
                y = 40;
            }
            String line = (step.completed ? "[✓] " : "[ ] ") + step.stepName;
            canvas.drawText(line, 50, y, textPaint);
            y += 18;
        }

        y += 20;
        canvas.drawText("Anexos: " + attachments.size(), 40, y, sectionPaint);
        y += 24;
        for (AttachmentEntity a : attachments) {
            if (y > 780) {
                document.finishPage(page);
                page = document.startPage(pageInfo);
                canvas = page.getCanvas();
                y = 40;
            }
            String line = "• " + new File(a.filePath).getName()
                    + (a.latitude != 0 ? String.format(Locale.ROOT, " (GPS: %.5f, %.5f)",
                            a.latitude, a.longitude) : "");
            canvas.drawText(line, 50, y, textPaint);
            y += 18;
        }

        // Inserir assinatura se existir anexo do tipo assinatura
        for (AttachmentEntity a : attachments) {
            if (a.filePath.contains("assinatura")) {
                try {
                    android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
                    opts.inSampleSize = 4;
                    Bitmap sig = android.graphics.BitmapFactory.decodeFile(a.filePath, opts);
                    if (sig != null) {
                        y += 10;
                        if (y > 700) {
                            document.finishPage(page);
                            page = document.startPage(pageInfo);
                            canvas = page.getCanvas();
                            y = 40;
                        }
                        canvas.drawText("Assinatura do cliente:", 40, y, sectionPaint);
                        y += 10;
                        canvas.drawBitmap(sig, 40, y, null);
                        sig.recycle();
                    }
                } catch (Exception ignored) {}
            }
        }

        document.finishPage(page);
        try (FileOutputStream out = new FileOutputStream(pdfFile)) {
            document.writeTo(out);
        }
        document.close();
        return pdfFile;
    }
}
