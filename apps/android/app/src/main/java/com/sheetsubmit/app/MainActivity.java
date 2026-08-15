package com.sheetsubmit.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.UUID;

public class MainActivity extends Activity {

    private static final String PREFS_NAME = "sheetsubmit";
    private static final String TAG = "SheetSubmit";
    private static final int REQ_OVERLAY_PERMISSION = 2001;
    private static final int REQ_NOTIFICATION_PERMISSION = 2002;
    private static final int REQ_FILE_CHOOSER = 2003;
    private static final int REQ_UNKNOWN_APP_SOURCES = 2004;
    private static final int UPDATE_RETRIES = 2;
    private static final int DOWNLOAD_CONNECT_TIMEOUT = 30000;
    private static final int DOWNLOAD_READ_TIMEOUT = 60000;

    private WebView webView;
    private String did;
    private boolean sessionApplied = false;
    private volatile boolean destroyed = false;
    private final Handler pollHandler = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> filePathCallback;
    private AlertDialog progressDialog;
    private AlertDialog updateDialog;
    private ProgressBar progressBar;
    private TextView progressText;
    private String pendingApkUrl;
    private long pendingApkSize;

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            checkDeviceLogin();
            if (!sessionApplied) {
                pollHandler.postDelayed(this, 4000);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        did = getDeviceToken();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return false;
                Uri u = Uri.parse(url);
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                String host = u.getHost() == null ? "" : u.getHost();

                if (scheme.equals("tg") || host.equals("t.me") || host.equals("telegram.me")) {
                    String newUrl = url;
                    if (newUrl.contains("start=login") && !newUrl.contains("login_")) {
                        newUrl = newUrl.replace("start=login", "start=login_" + did);
                    }
                    openExternal(newUrl);
                    return true;
                }
                if (host.equals(Config.APP_HOST)) {
                    view.loadUrl(url);
                    return true;
                }
                openExternal(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectClipboardBridge();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView popup = new WebView(view.getContext());
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        v.loadUrl(url);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    if (url == null || url.startsWith("blob:")) return;
                    String name = url.substring(url.lastIndexOf('/') + 1);
                    if (name.isEmpty() || name.contains("?")) name = "download.xlsx";
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setTitle(name);
                    if (mimetype != null) req.setMimeType(mimetype);
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) dm.enqueue(req);
                } catch (Exception e) {
                    Log.e(TAG, "download: " + e.getMessage());
                }
            }
        });

        CookieManager.getInstance().setAcceptCookie(true);

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String readClipboard() {
                try {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
                        CharSequence cs = cm.getPrimaryClip().getItemAt(0).getText();
                        return cs != null ? cs.toString() : "";
                    }
                } catch (Exception e) { Log.e(TAG, "readClipboard: " + e.getMessage()); }
                return "";
            }

            @JavascriptInterface
            public void writeClipboard(String text) {
                try {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) {
                        cm.setPrimaryClip(ClipData.newPlainText("sheetsubmit", text == null ? "" : text));
                    }
                } catch (Exception e) { Log.e(TAG, "writeClipboard: " + e.getMessage()); }
            }

            @JavascriptInterface
            public void download(String name, String dataUrl) {
                saveDownload(name, dataUrl);
            }

            @JavascriptInterface
            public boolean isBubbleEnabled() {
                SharedPreferences p = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                return p.getString("bubble_file", null) != null;
            }

            @JavascriptInterface
            public void enableBubble(String fileId) {
                final String fid = fileId == null ? "" : fileId;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        requestEnableBubble(fid);
                    }
                });
            }

            @JavascriptInterface
            public void disableBubble() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                                .edit().remove("bubble_file").apply();
                        FloatingBubbleService.stop(MainActivity.this);
                    }
                });
            }

            @JavascriptInterface
            public String getBubbleFile() {
                return getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString("bubble_file", "");
            }

            @JavascriptInterface
            public void checkForUpdates() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this, "Checking for updates…", Toast.LENGTH_SHORT).show();
                    }
                });
                fetchLatestRelease(new ReleaseListener() {
                    @Override
                    public void onResult(final JSONObject json) {
                        final String tag = json.optString("tag_name");
                        if (!tag.matches("v\\d+")) return;
                        try {
                            int installed = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
                            if (Integer.parseInt(tag.substring(1)) <= installed) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        Toast.makeText(MainActivity.this, "You're up to date (v" + tag + ")", Toast.LENGTH_SHORT).show();
                                    }
                                });
                                return;
                            }
                            JSONObject asset = json.getJSONArray("assets").optJSONObject(0);
                            if (asset == null) return;
                            final String apkUrl = asset.getString("browser_download_url");
                            final long mb = asset.getLong("size") / (1024L * 1024L);
                            final String body = json.optString("body", "").trim();
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    showUpdateCard(tag, mb, body, apkUrl, asset.optLong("size"));
                                }
                            });
                        } catch (Exception e) {
                            Log.e(TAG, "checkForUpdates: " + e.getMessage());
                        }
                    }

                    @Override
                    public void onError() {
                        // silent — keep pre-existing behavior on fetch failure
                    }
                });
            }

            @JavascriptInterface
            public void openSupport() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/Cryptoistaken")));
                        } catch (Exception e) {
                            Log.e(TAG, "openSupport: " + e.getMessage());
                        }
                    }
                });
            }

            @JavascriptInterface
            public void whatsNew() {
                fetchLatestRelease(new ReleaseListener() {
                    @Override
                    public void onResult(final JSONObject json) {
                        final String tag = json.optString("tag_name");
                        final String body = json.optString("body", "").trim();
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (tag.isEmpty()) {
                                    Toast.makeText(MainActivity.this, R.string.whats_new_error, Toast.LENGTH_LONG).show();
                                    return;
                                }
                                if (isFinishing() || isDestroyed()) return;
                                AlertDialog.Builder b = new AlertDialog.Builder(MainActivity.this);
                                b.setTitle(getString(R.string.whats_new_title) + " in " + tag);
                                b.setMessage(body.isEmpty() ? getString(R.string.whats_new_empty) : body);
                                b.setPositiveButton("OK", null);
                                b.show();
                            }
                        });
                    }

                    @Override
                    public void onError() {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                Toast.makeText(MainActivity.this, R.string.whats_new_error, Toast.LENGTH_LONG).show();
                            }
                        });
                    }
                });
            }
        }, "Android");

    webView.loadUrl(Config.HOME_URL);
        pollHandler.post(pollRunnable);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)) {
            if (getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString("bubble_file", null) != null) {
                FloatingBubbleService.start(this);
            }
        }
    }

    private interface ReleaseListener {
        void onResult(JSONObject release);
        void onError();
    }

    private void fetchLatestRelease(final ReleaseListener listener) {
        final String releasesUrl = "https://api.github.com/repos/" + Config.GITHUB_REPO + "/releases/latest";
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL u = new URL(releasesUrl);
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("User-Agent", "SheetSubmit-Updater");
                    conn.setRequestMethod("GET");
                    if (conn.getResponseCode() != 200) {
                        listener.onError();
                        return;
                    }
                    InputStream is = conn.getInputStream();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(is));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    listener.onResult(new JSONObject(sb.toString()));
                } catch (Exception e) {
                    Log.e(TAG, "fetchLatestRelease: " + e.getMessage());
                    listener.onError();
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }

    private void injectClipboardBridge() {
        String shim = "(function(){" +
            "if(window.Android&&window.Android.readClipboard&&window.Android.writeClipboard){" +
            "navigator.clipboard.readText=function(){return new Promise(function(res,rej){try{res(window.Android.readClipboard());}catch(e){rej(e);}});};" +
            "navigator.clipboard.writeText=function(t){window.Android.writeClipboard(String(t));return Promise.resolve();};" +
            "navigator.clipboard.read=function(){return Promise.reject(new Error('not supported'));};" +
            "window.nativeClipboardReady=true;}" +
            "})();";
        webView.evaluateJavascript(shim, null);
    }

    private String getDeviceToken() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String id = prefs.getString("did", "");
        if (id.isEmpty()) {
            id = UUID.randomUUID().toString().replace("-", "");
            prefs.edit().putString("did", id).apply();
            Log.d(TAG, "Generated device id");
        }
        return id;
    }

    private void checkDeviceLogin() {
        final String pollUrl = Config.HOME_URL + "/api/auth/device?token=" + did;
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL u = new URL(pollUrl);
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setRequestMethod("GET");
                    int code = conn.getResponseCode();
                    if (code != 200) return;
                    InputStream is = conn.getInputStream();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(is));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    JSONObject json = new JSONObject(sb.toString());
                    if (json.optBoolean("ok") && json.has("sessionId")) {
                        final String sessionId = json.getString("sessionId");
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                applySession(sessionId);
                            }
                        });
                    }
                } catch (Exception e) {
                    // transient; retry on next poll
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }

    private void applySession(String sessionId) {
        if (sessionApplied) return;
        sessionApplied = true;
        String cookie = "session=" + sessionId + "; Path=/; HttpOnly; Max-Age=2592000";
        CookieManager cm = CookieManager.getInstance();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cm.setCookie(Config.HOME_URL, cookie, new ValueCallback<Boolean>() {
                @Override
                public void onReceiveValue(Boolean value) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (webView != null) webView.loadUrl(Config.HOME_URL);
                        }
                    });
                }
            });
        } else {
            cm.setCookie(Config.HOME_URL, cookie);
            if (webView != null) webView.loadUrl(Config.HOME_URL);
        }
        Log.d(TAG, "Session applied via device login");
    }

    private void openExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception e) {
            if (webView != null) webView.loadUrl(url);
        }
    }

    private void saveDownload(final String rawName, final String dataUrl) {
        try {
            if (dataUrl == null || dataUrl.indexOf(',') < 0) return;
            String meta = dataUrl.substring(0, dataUrl.indexOf(','));
            String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            final String name = sanitizeFileName(rawName);
            String mime = meta.contains("csv") ? "text/csv"
                    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SheetSubmit");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IOException("No Downloads provider");
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) throw new IOException("Cannot open Downloads");
                os.write(bytes);
                os.close();
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SheetSubmit");
                if (!dir.exists()) dir.mkdirs();
                FileOutputStream fos = new FileOutputStream(new File(dir, name));
                fos.write(bytes);
                fos.close();
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, "Saved to Downloads/SheetSubmit/" + name, Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "saveDownload: " + e.getMessage());
            final String err = e.getMessage();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, "Download failed: " + (err == null ? "unknown" : err), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    private String sanitizeFileName(String raw) {
        String s = raw == null ? "download.xlsx" : raw;
        s = s.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return s.isEmpty() ? "download.xlsx" : s;
    }

    private void requestEnableBubble(String fileId) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit().putString("bubble_file", fileId).apply();
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATION_PERMISSION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                startActivityForResult(intent, REQ_OVERLAY_PERMISSION);
            } catch (Exception e) {
                FloatingBubbleService.start(this);
            }
            return;
        }
        FloatingBubbleService.start(this);
    }

    private void showUpdateCard(final String tag, final long mb, final String body,
                                final String apkUrl, final long sizeBytes) {
        if (isFinishing() || isDestroyed()) return;
        float density = getResources().getDisplayMetrics().density;
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding((int) (4 * density), (int) (4 * density), (int) (4 * density), (int) (4 * density));

        TextView line = new TextView(this);
        line.setText("v" + tag + " · " + mb + " MB — install over the current version, data preserved");
        layout.addView(line);

        if (!body.isEmpty()) {
            View divider = new View(this);
            divider.setBackgroundColor(0xFF9CA3AF);
            LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, (int) (1 * density));
            dlp.topMargin = (int) (12 * density);
            dlp.bottomMargin = (int) (12 * density);
            layout.addView(divider, dlp);

            TextView heading = new TextView(this);
            heading.setText("What's new");
            heading.setTypeface(heading.getTypeface(), Typeface.BOLD);
            LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            hlp.bottomMargin = (int) (4 * density);
            layout.addView(heading, hlp);

            TextView notes = new TextView(this);
            notes.setText(body);
            layout.addView(notes);
        }

        AlertDialog.Builder b = new AlertDialog.Builder(this);
        b.setTitle("Update available");
        b.setView(layout);
        b.setPositiveButton("Update", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface d, int which) {
                launchDownload(apkUrl, sizeBytes);
            }
        });
        b.setNegativeButton("Later", null);
        updateDialog = b.create();
        updateDialog.show();
    }

    private void launchDownload(final String apkUrl, final long sizeBytes) {
        if (isFinishing() || isDestroyed()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            pendingApkUrl = apkUrl;
            pendingApkSize = sizeBytes;
            new AlertDialog.Builder(this)
                    .setTitle("Allow installing updates?")
                    .setMessage("SheetSubmit needs to install the update. You'll be taken to Settings to allow \"Install unknown apps\" for SheetSubmit — this is required only once.")
                    .setPositiveButton("Allow", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface d, int which) {
                            try {
                                startActivityForResult(new Intent(
                                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                        Uri.parse("package:" + getPackageName())), REQ_UNKNOWN_APP_SOURCES);
                            } catch (Exception e) {
                                startDownload(apkUrl, sizeBytes);
                            }
                        }
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        } else {
            startDownload(apkUrl, sizeBytes);
        }
    }

    private void startDownload(final String apkUrl, final long totalBytes) {
        showInlineProgress(totalBytes);
        new Thread(new Runnable() {
            @Override
            public void run() {
                Exception last = null;
                for (int attempt = 0; attempt < UPDATE_RETRIES; attempt++) {
                    HttpURLConnection conn = null;
                    InputStream is = null;
                    FileOutputStream fos = null;
                    try {
                        File dir = new File(getCacheDir(), "apk");
                        if (!dir.exists()) dir.mkdirs();
                        final File target = new File(dir, "update.apk");
                        if (target.exists()) target.delete();
                        URL u = new URL(apkUrl);
                        conn = (HttpURLConnection) u.openConnection();
                        conn.setConnectTimeout(DOWNLOAD_CONNECT_TIMEOUT);
                        conn.setReadTimeout(DOWNLOAD_READ_TIMEOUT);
                        conn.setRequestProperty("User-Agent", "SheetSubmit-Updater");
                        conn.setRequestMethod("GET");
                        int code = conn.getResponseCode();
                        if (code != 200) throw new IOException("Download failed (HTTP " + code + ")");
                        is = conn.getInputStream();
                        fos = new FileOutputStream(target);
                        byte[] buf = new byte[8192];
                        long downloaded = 0;
                        int n;
                        int lastPct = -1;
                        while ((n = is.read(buf)) != -1) {
                            fos.write(buf, 0, n);
                            downloaded += n;
                            if (totalBytes > 0) {
                                final int pct = (int) (downloaded * 100 / totalBytes);
                                if (pct != lastPct) {
                                    lastPct = pct;
                                    final long dl = downloaded;
                                    runOnUiThread(new Runnable() {
                                        @Override
                                        public void run() {
                                            if (destroyed) return;
                                            updateProgress(pct, dl, totalBytes);
                                        }
                                    });
                                }
                            }
                        }
                        fos.flush();
                        fos.close();
                        fos = null;
                        is.close();
                        is = null;
                        conn.disconnect();
                        conn = null;
                        final File apk = target;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (destroyed || isFinishing() || isDestroyed()) return;
                                dismissProgress();
                                openInstaller(apk);
                            }
                        });
                        return;
                    } catch (Exception e) {
                        last = e;
                        if (destroyed) return;
                        if (fos != null) {
                            try { fos.close(); } catch (Exception ignored) {}
                        }
                        if (is != null) {
                            try { is.close(); } catch (Exception ignored) {}
                        }
                        if (conn != null) conn.disconnect();
                        if (attempt < UPDATE_RETRIES - 1) {
                            try {
                                Thread.sleep(1000L * (attempt + 1));
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                            }
                        }
                    }
                }
                final String err = last != null && last.getMessage() != null ? last.getMessage() : "Update failed";
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (destroyed || isFinishing() || isDestroyed()) return;
                        dismissProgress();
                        Toast.makeText(MainActivity.this, err, Toast.LENGTH_LONG).show();
                    }
                });
            }
        }).start();
    }

    private void showInlineProgress(long totalBytes) {
        if (updateDialog != null && updateDialog.isShowing()) {
            float density = getResources().getDisplayMetrics().density;
            LinearLayout layout = new LinearLayout(this);
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setPadding((int) (4 * density), (int) (4 * density), (int) (4 * density), (int) (4 * density));
            ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
            bar.setMax(100);
            TextView text = new TextView(this);
            text.setText("0% · 0.0 / " + String.format(Locale.US, "%.1f MB", totalBytes / 1048576.0));
            layout.addView(bar);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = (int) (12 * density);
            layout.addView(text, lp);
            progressBar = bar;
            progressText = text;
            progressDialog = updateDialog;
            updateDialog.setTitle("Downloading update…");
            updateDialog.setCancelable(false);
            updateDialog.setView(layout);
            Button positive = updateDialog.getButton(DialogInterface.BUTTON_POSITIVE);
            if (positive != null) positive.setVisibility(View.GONE);
            Button negative = updateDialog.getButton(DialogInterface.BUTTON_NEGATIVE);
            if (negative != null) negative.setVisibility(View.GONE);
        } else {
            showProgressDialog(totalBytes);
        }
    }

    private void showProgressDialog(long totalBytes) {
        float density = getResources().getDisplayMetrics().density;
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (16 * density);
        layout.setPadding(pad, pad, pad, pad);
        ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        TextView text = new TextView(this);
        text.setText("0% · 0.0 / " + String.format(Locale.US, "%.1f MB", totalBytes / 1048576.0));
        layout.addView(bar);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = (int) (12 * density);
        layout.addView(text, lp);
        progressBar = bar;
        progressText = text;
        progressDialog = new AlertDialog.Builder(this)
                .setTitle("Downloading update…")
                .setView(layout)
                .setCancelable(false)
                .create();
        progressDialog.show();
    }

    private void updateProgress(int pct, long downloaded, long totalBytes) {
        if (progressBar != null) progressBar.setProgress(pct);
        if (progressText != null) {
            progressText.setText(String.format(Locale.US, "%d%% · %.1f / %.1f MB",
                    pct, downloaded / 1048576.0, totalBytes / 1048576.0));
        }
    }

    private void dismissProgress() {
        if (progressDialog != null && progressDialog.isShowing()) {
            try {
                progressDialog.dismiss();
            } catch (Exception ignored) {}
        }
        progressDialog = null;
        progressBar = null;
        progressText = null;
    }

    private void openInstaller(File apk) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(ApkProvider.uriFor(this, apk), "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(MainActivity.this, "Cannot open installer", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_OVERLAY_PERMISSION) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)) {
                FloatingBubbleService.start(this);
            }
        }
        if (requestCode == REQ_UNKNOWN_APP_SOURCES) {
            if (getPackageManager().canRequestPackageInstalls()) {
                if (pendingApkUrl != null) {
                    startDownload(pendingApkUrl, pendingApkSize);
                    pendingApkUrl = null;
                }
            } else {
                Toast.makeText(this,
                        "Please allow 'Install unknown apps' for SheetSubmit, then try again",
                        Toast.LENGTH_LONG).show();
            }
        }
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        pollHandler.removeCallbacks(pollRunnable);
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!sessionApplied) {
            pollHandler.removeCallbacks(pollRunnable);
            pollHandler.post(pollRunnable);
        }
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        pollHandler.removeCallbacks(pollRunnable);
        dismissProgress();
        if (webView != null) {
            try {
                if (webView.getParent() != null) {
                    ((ViewGroup) webView.getParent()).removeView(webView);
                }
            } catch (Exception ignored) {}
            webView.destroy();
        }
        super.onDestroy();
    }
}
