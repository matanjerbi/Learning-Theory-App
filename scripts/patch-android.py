# Applies the app's settings to the Android project that `npx cap add android` generates.
import re, sys
def edit(path, fn, required=True):
    s = open(path, encoding='utf-8').read(); n = fn(s)
    if n == s and required: sys.exit('patch failed: ' + path)
    open(path, 'w', encoding='utf-8').write(n)

edit('android/app/src/main/AndroidManifest.xml', lambda s: s.replace(
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n'
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n'
    '    <uses-permission android:name="android.permission.VIBRATE" />\n\n'
    '    <queries>\n        <intent>\n            <action android:name="android.intent.action.TTS_SERVICE" />\n'
    '        </intent>\n    </queries>'))

def gradle(s):
    s = s.replace('    buildTypes {',
        '    signingConfigs {\n        debug {\n            storeFile file("../../keystore/theory.keystore")\n'
        '            storePassword "theoryapp"\n            keyAlias "theory"\n            keyPassword "theoryapp"\n'
        '        }\n    }\n    buildTypes {', 1)
    s = re.sub(r'versionCode \d+', 'versionCode((System.getenv("BUILD_NUMBER") ?: "1").toInteger())', s)
    s = re.sub(r'versionName "[^"]*"', 'versionName "1.0." + (System.getenv("BUILD_NUMBER") ?: "0")', s)
    return s
edit('android/app/build.gradle', gradle)

edit('android/app/src/main/res/values/strings.xml', lambda s: re.sub(
    r'(<string name="(app_name|title_activity_main)">)[^<]*(</string>)', r'\1תאוריה בקטנה\3', s), required=False)
edit('android/app/src/main/res/values/ic_launcher_background.xml', lambda s: s.replace('#FFFFFF', '#F6F4EF'))
print('android patched')
