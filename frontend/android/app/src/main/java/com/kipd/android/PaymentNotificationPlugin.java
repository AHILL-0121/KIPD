package com.kipd.android;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PaymentNotification")
public class PaymentNotificationPlugin extends Plugin {
    
    private static PaymentNotificationPlugin instance;
    
    @Override
    public void load() {
        instance = this;
    }

    public static PaymentNotificationPlugin getInstance() {
        return instance;
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        Context context = getContext();
        String pkgName = context.getPackageName();
        final String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        boolean hasPermission = false;
        
        if (!TextUtils.isEmpty(flat)) {
            final String[] names = flat.split(":");
            for (int i = 0; i < names.length; i++) {
                final ComponentName cn = ComponentName.unflattenFromString(names[i]);
                if (cn != null && TextUtils.equals(pkgName, cn.getPackageName())) {
                    hasPermission = true;
                    break;
                }
            }
        }
        
        JSObject ret = new JSObject();
        ret.put("granted", hasPermission);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        call.resolve();
    }

    // Called by the Service when a payment is detected
    public void notifyPayment(String amount, String reference, String packageName, String rawText) {
        JSObject ret = new JSObject();
        ret.put("amount", amount);
        ret.put("reference", reference);
        ret.put("packageName", packageName);
        ret.put("rawText", rawText);
        ret.put("timestamp", System.currentTimeMillis());
        notifyListeners("onPaymentReceived", ret);
    }
}
