package com.smsscheduler;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.telephony.SmsManager;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import androidx.core.app.AlarmManagerCompat;

public class SmsModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContext;

    SmsModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @Override
    public String getName() {
        return "SmsModule";
    }

    // SMS'i zamanlayan ana metod
    @ReactMethod
    public void scheduleSms(String id, String phoneNumber, String message, double timeInMs) {
        Log.d("SmsModule", "Scheduling SMS for " + phoneNumber);

        // Zamanlama için AlarmManager ve Intent oluştur
        AlarmManager alarmManager = (AlarmManager) reactContext.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(reactContext, SmsBroadcastReceiver.class);
        intent.setAction("com.smsscheduler.SMS_SENT_ACTION");
        intent.putExtra("phoneNumber", phoneNumber);
        intent.putExtra("message", message);
        intent.putExtra("id", id);
        
        // Android 12 (API 31) ve üstü için PendingIntent ayarları
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags = flags | PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(reactContext, id.hashCode(), intent, flags);
        
        // Tam saatte SMS göndermek için setExactAndAllowWhileIdle kullan
        // Bu metod, cihaz uyku modunda olsa bile alarmın tam zamanında tetiklenmesini sağlar
        long triggerTime = (long) timeInMs;
        
        if (alarmManager != null) {
            try {
                // SCHEDULE_EXACT_ALARM izni kontrolü burada zaten gerekli
                AlarmManagerCompat.setExactAndAllowWhileIdle(alarmManager, AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
                Log.d("SmsModule", "SMS scheduled successfully.");
            } catch (SecurityException e) {
                // İzin verilmediyse logla ve hata fırlat
                Log.e("SmsModule", "Failed to schedule SMS: Missing SCHEDULE_EXACT_ALARM permission", e);
                // Bu hata JS tarafında Promise ile yakalanabilir, ancak şimdilik logluyoruz
            }
        }
    }

    // Zamanlanmış SMS'i iptal etme
    @ReactMethod
    public void cancelSms(String id) {
        Log.d("SmsModule", "Canceling SMS with ID: " + id);
        AlarmManager alarmManager = (AlarmManager) reactContext.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(reactContext, SmsBroadcastReceiver.class);
        
        int flags = PendingIntent.FLAG_NO_CREATE; // Sadece varsa alır
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags = flags | PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(reactContext, id.hashCode(), intent, flags);

        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel(); // Kaynağı serbest bırak
            Log.d("SmsModule", "SMS cancelled successfully.");
        } else {
            Log.d("SmsModule", "Pending intent for SMS not found, cannot cancel.");
        }
    }
    
    // Uygulamanın kesin alarm kurma izni olup olmadığını kontrol et
    @ReactMethod
    public void canScheduleExactAlarms(Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager = (AlarmManager) reactContext.getSystemService(Context.ALARM_SERVICE);
            promise.resolve(alarmManager.canScheduleExactAlarms());
        } else {
            // Eski Android versiyonlarında bu kontrol gerekmez, her zaman izinli kabul ederiz
            promise.resolve(true);
        }
    }

    // Kullanıcıyı kesin alarm izni verebileceği ayarlar ekranına yönlendir
    @ReactMethod
    public void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + reactContext.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
        }
    }
}
