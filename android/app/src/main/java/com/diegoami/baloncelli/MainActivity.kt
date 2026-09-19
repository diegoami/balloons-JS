package com.diegoami.baloncelli

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * The game, in a WebView, served to itself over https.
 *
 * WHY NOT file://
 *
 * The obvious way to ship bundled assets is to load them from file://, and it
 * does not work here. That is an opaque origin: localStorage -- which is where
 * the player's name lives -- is unreliable or blocked, and a fetch to the
 * leaderboard is a cross-origin request from an origin that cannot make one,
 * so the CORS headers on the score function would not help.
 *
 * WebViewAssetLoader serves the same files over
 * https://appassets.androidplatform.net/, which is a real origin. The name
 * persists, the board works when there is a connection, and the game is
 * unchanged from the one on the website -- literally: the assets are copied
 * from public/ at build time.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView

    /** Where the game is served from, and where its scores are posted. */
    private val origin = "https://appassets.androidplatform.net"
    private val page = "$origin/assets/www/index.html"
    private val board = "https://baloncelli.netlify.app/api/scores"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // The prefix is STRIPPED before the handler sees the path.
        //
        // This was registered under "/www/" while the game lives in
        // assets/www/, so a request for /www/index.html arrived at the handler
        // as "index.html" and it went looking for assets/index.html. Nothing
        // there, nothing loads, and the app opens on "cannot load the page".
        //
        // Registered under "/assets/", a request for /assets/www/index.html
        // reaches the handler as "www/index.html" and finds assets/www/index.html.
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Nothing is loaded from the network except the board, and that is
            // https, so cleartext is never needed.
            settings.mediaPlaybackRequiresUserGesture = false
            // A canvas game wants every pixel it can get and no pinch-zoom.
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

                // A failure to load the game is worth a line in logcat saying
                // which URL failed. The first version of this failed silently
                // on a path that did not exist, and the only evidence was an
                // error page.
                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: android.webkit.WebResourceError
                ) {
                    android.util.Log.e(
                        "Baloncelli",
                        "could not load " + request.url + ": " + error.description
                    )
                }
            }
        }

        setContentView(web)
        goFullscreen()

        tellThePageWhereTheBoardIs()
        web.loadUrl(page)

        // Back leaves the game rather than walking the history of a single
        // page, because there is no history to walk.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                finish()
            }
        })
    }

    /**
     * Where the leaderboard is, set before the page's own scripts run.
     *
     * scores.js reads window.BALLOONS_SCORES_URL as it loads and falls back to
     * a relative path, which is right for the website and wrong for an app
     * that shares an origin with nothing.
     *
     * evaluateJavascript BEFORE loadUrl does not work, which is what this was
     * first written as: loading a page builds a fresh JavaScript context and
     * the variable is gone before anything reads it. addDocumentStartJavaScript
     * is the one that runs at document start of every load, which is the only
     * moment early enough.
     *
     * If the WebView is too old to support it the game simply falls back to
     * the relative path, gets a 404 from its own asset loader, and plays
     * without a board -- which the score client already handles, because the
     * leaderboard is a nicety and the game works offline without it.
     */
    private fun tellThePageWhereTheBoardIs() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            return
        }
        WebViewCompat.addDocumentStartJavaScript(
            web,
            "window.BALLOONS_SCORES_URL = '$board';",
            setOf(origin)
        )
    }

    /**
     * Edge to edge, with the bars hidden until they are asked for.
     *
     * A balloon that escapes behind a status bar is a life lost to furniture.
     */
    private fun goFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, web).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            goFullscreen()
        }
    }

    /**
     * Nothing to do on a rotation but let it happen.
     *
     * The manifest declares configChanges for it, so this activity is NOT
     * destroyed and rebuilt: the WebView keeps its page, the page gets a
     * resize event, and the game re-anchors everything in the sky to the new
     * shape. Without that declaration the run in progress would be thrown away
     * every time somebody turned the phone.
     */
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        goFullscreen()
    }

    override fun onPause() {
        super.onPause()
        // The game pauses itself when the page is hidden; this makes sure the
        // page knows it is.
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }
}
