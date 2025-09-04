package com.smsscheduler;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.SmsManager;
import android.util.Log;
import android.widget.Toast;

import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import android.os.Build;

public class SmsBroadcastReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String phoneNumber = intent.getStringExtra("phoneNumber");
        String message = intent.getStringExtra("message");
        String id = intent.getStringExtra("id");

        if (phoneNumber == null || message == null || id == null) {
            Log.e("SmsReceiver", "Intent data is missing.");
            return;
        }

        Log.d("SmsReceiver", "Received SMS intent for " + id);

        try {
            SmsManager smsManager = SmsManager.getDefault();
            smsManager.sendTextMessage(phoneNumber, null, message, null, null);
            Toast.makeText(context, "SMS gönderildi: " + phoneNumber, Toast.LENGTH_SHORT).show();
            
            // Başarılı geri bildirimi React Native'e gönder
            sendEvent(context, id, "sent");

        } catch (Exception e) {
            Log.e("SmsReceiver", "Failed to send SMS", e);
            Toast.makeText(context, "SMS gönderilemedi: " + phoneNumber, Toast.LENGTH_SHORT).show();
            
            // Hata geri bildirimini React Native'e gönder
            sendEvent(context, id, "failed");
        }
    }
    
    private void sendEvent(Context context, String smsId, String status) {
        try {
            ReactContext reactContext = (ReactContext) context.getApplicationContext();
            if (reactContext.hasActiveCatalystInstance()) {
                WritableMap params = Arguments.createMap();
                params.putString("id", smsId);
                params.putString("status", status);
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onSmsStatus", params);
            }
        } catch (ClassCastException e) {
            Log.e("SmsReceiver", "Could not cast context to ReactContext. App might be in background.", e);
        }
    }
}
