package com.kipd.android;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void print() {
                    runOnUiThread(() -> {
                        try {
                            PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                            if (printManager != null && getBridge() != null && getBridge().getWebView() != null) {
                                PrintDocumentAdapter printAdapter = getBridge().getWebView().createPrintDocumentAdapter("Kipd_Document");
                                printManager.print("Kipd_Document", printAdapter, new PrintAttributes.Builder().build());
                            }
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    });
                }
            }, "AndroidPrinter");

            getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public long getVersionCode() {
                    try {
                        PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                        return PackageInfoCompat.getLongVersionCode(info);
                    } catch (Exception e) {
                        return 1L;
                    }
                }
            }, "AndroidUpdater");
        }
    }
}
