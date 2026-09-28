package dev.vermilion10.blogeditor

import android.app.Activity
import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import androidx.core.view.WindowCompat
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class KeyArgs {
  lateinit var key: String
}

@InvokeArg
class BarArgs {
  var light: Boolean = false
}

@InvokeArg
class SetArgs {
  lateinit var key: String
  lateinit var value: String
}

/**
 * Android side of the app's device services (called from src-tauri/src/device.rs).
 *
 * Secrets: each value is encrypted with AES-256-GCM under a key that lives in
 * the Android Keystore, so the key material never leaves secure hardware; only
 * the ciphertext is kept, in the app's private preferences.
 *
 * Dynamic color: the wallpaper-derived system accent on Android 12+.
 *
 * System bars: the app draws edge to edge, so the status and navigation bar
 * icons are switched to dark or light to stay readable on the app theme.
 */
@TauriPlugin
class DevicePlugin(private val activity: Activity) : Plugin(activity) {
  private val prefs = activity.getSharedPreferences("secrets", Context.MODE_PRIVATE)

  private fun secretKey(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  @Command
  fun secretGet(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(KeyArgs::class.java)
      val stored = prefs.getString(args.key, null)
      val result = JSObject()
      if (stored == null) {
        result.put("value", null)
      } else {
        val bytes = Base64.decode(stored, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes, 0, IV_LEN))
        result.put("value", String(cipher.doFinal(bytes, IV_LEN, bytes.size - IV_LEN), Charsets.UTF_8))
      }
      invoke.resolve(result)
    } catch (e: Exception) {
      invoke.reject("Could not read the stored secret: ${e.message}")
    }
  }

  @Command
  fun secretSet(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SetArgs::class.java)
      val cipher = Cipher.getInstance(TRANSFORM)
      cipher.init(Cipher.ENCRYPT_MODE, secretKey())
      val out = cipher.iv + cipher.doFinal(args.value.toByteArray(Charsets.UTF_8))
      prefs.edit().putString(args.key, Base64.encodeToString(out, Base64.NO_WRAP)).apply()
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject("Could not store the secret: ${e.message}")
    }
  }

  @Command
  fun secretDelete(invoke: Invoke) {
    val args = invoke.parseArgs(KeyArgs::class.java)
    prefs.edit().remove(args.key).apply()
    invoke.resolve()
  }

  @Command
  fun dynamicColor(invoke: Invoke) {
    val result = JSObject()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val argb = activity.getColor(android.R.color.system_accent1_500)
      result.put("value", String.format("#%06x", argb and 0xFFFFFF))
    } else {
      result.put("value", null)
    }
    invoke.resolve(result)
  }

  @Command
  fun setSystemBars(invoke: Invoke) {
    val args = invoke.parseArgs(BarArgs::class.java)
    activity.runOnUiThread {
      val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
      controller.isAppearanceLightStatusBars = args.light
      controller.isAppearanceLightNavigationBars = args.light
    }
    invoke.resolve()
  }

  companion object {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "blog-editor-secrets"
    private const val TRANSFORM = "AES/GCM/NoPadding"
    private const val IV_LEN = 12
  }
}
