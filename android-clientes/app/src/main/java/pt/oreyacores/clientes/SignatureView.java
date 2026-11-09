package pt.oreyacores.clientes;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

/**
 * View de assinatura digital – o cliente assina no ecrã para aprovar documentos.
 */
public class SignatureView extends View {

    private final Path path = new Path();
    private final Paint paint = new Paint();
    private float lastX, lastY;
    private boolean hasSignature = false;

    public SignatureView(Context context) { super(context); init(); }
    public SignatureView(Context context, AttributeSet attrs) { super(context, attrs); init(); }

    private void init() {
        paint.setAntiAlias(true);
        paint.setColor(Color.BLACK);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(6f);
        setBackgroundColor(Color.WHITE);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.drawPath(path, paint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX(), y = event.getY();
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                path.moveTo(x, y); lastX = x; lastY = y; hasSignature = true; break;
            case MotionEvent.ACTION_MOVE:
                float dx = Math.abs(x - lastX), dy = Math.abs(y - lastY);
                if (dx >= 2 || dy >= 2) {
                    path.quadTo(lastX, lastY, (x + lastX) / 2, (y + lastY) / 2);
                    lastX = x; lastY = y;
                }
                break;
            case MotionEvent.ACTION_UP:
                path.lineTo(x, y); break;
        }
        invalidate();
        return true;
    }

    public void clear() { path.reset(); hasSignature = false; invalidate(); }
    public boolean hasSignature() { return hasSignature; }

    public Bitmap getSignatureBitmap() {
        Bitmap bmp = Bitmap.createBitmap(Math.max(1, getWidth()), Math.max(1, getHeight()),
                Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        c.drawColor(Color.WHITE);
        draw(c);
        return bmp;
    }
}
