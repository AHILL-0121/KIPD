package com.kipd.android;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.os.Bundle;
import android.util.Log;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class UPIListenerService extends NotificationListenerService {
    private static final String TAG = "UPIListenerService";
    
    // Array of supported packages
    private static final String[] SUPPORTED_PACKAGES = {
        "com.google.android.apps.nbu.paisa.user", // GPay
        "com.phonepe.app",                        // PhonePe
        "net.one97.paytm"                         // Paytm
    };

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();
        boolean isSupported = false;
        
        for (String pkg : SUPPORTED_PACKAGES) {
            if (pkg.equals(packageName)) {
                isSupported = true;
                break;
            }
        }
        
        if (!isSupported) return;
        
        Bundle extras = sbn.getNotification().extras;
        String title = extras.getString("android.title", "");
        String text = extras.getString("android.text", "");
        String fullText = title + " " + text;
        
        // Simple regex to extract common INR patterns e.g. Rs. 500, Rs 500.00, INR 500
        Pattern p = Pattern.compile("(?i)(?:Rs\\.?|INR|₹)\\s*([0-9,]+\\.?[0-9]*)");
        Matcher m = p.matcher(fullText);
        
        String amount = null;
        if (m.find()) {
            amount = m.group(1).replace(",", "");
        }
        
        // Match a 12 digit UPI reference number if present
        Pattern refPattern = Pattern.compile("\\b(\\d{12})\\b");
        Matcher refM = refPattern.matcher(fullText);
        String reference = null;
        if (refM.find()) {
            reference = refM.group(1);
        }
        
        if (amount != null && PaymentNotificationPlugin.getInstance() != null) {
            Log.d(TAG, "Payment detected: " + amount + " Ref: " + reference);
            PaymentNotificationPlugin.getInstance().notifyPayment(amount, reference, packageName, fullText);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Not used
    }
}
