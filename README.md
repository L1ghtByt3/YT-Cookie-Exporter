# YT-Cookie-Exporter

DESCRIPTION
Exports cookies associated with the youtube.com domain to a text file
in the Netscape HTTP Cookie File format.

FILE FORMAT
The exported file uses tab-separated fields compatible with the
Netscape HTTP Cookie File format.
Cookie expiration times are expressed as Unix timestamps in seconds.
Session cookies use 0 as their expiration value.

EXPORT LOCATION
Exported files are saved in the YT-Cookie-Exporter folder inside the
downloads directory configured in Firefox.

AUTOMATION
The extension lets you configure an automatic export interval in
minutes, stop automatic exports, and trigger an export manually
through the extension popup.

TEMPORARY INSTALLATION FOR TESTING
1. Extract the XPI file into a folder.
2. Open about:debugging#/runtime/this-firefox in Firefox.
3. Click "Load Temporary Add-on...".
4. Select the extracted manifest.json file.

LOCALIZATION
The interface uses translation files stored in the _locales directory.
Firefox selects the interface language according to its language
settings and the default locale specified in manifest.json.
Additional translations can be provided through locale-specific
messages.json files.

SECURITY
Exported files contain cookie values that may allow access to an
authenticated session. Treat these files as sensitive credentials.
Store them securely, do not share them, and delete them when they
are no longer needed.
