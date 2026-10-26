const ALARM_NAME = 'yt-cookie-exporter';
const DEFAULT_INTERVAL = 60;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 10080;

let exportInProgress = false;

const errorMessage = (error) =>
    String(error?.message || error || 'Unknown error');

async function notifyPopup(message) {
    try {
        await browser.runtime.sendMessage(message);
    } catch {
        // Le popup peut être fermé : ce n'est pas une erreur bloquante.
    }
}

function isYouTubeCookie(cookie) {
    const domain = (cookie.domain || '')
        .replace(/^\./, '')
        .toLowerCase();

    return domain === 'youtube.com' ||
        domain.endsWith('.youtube.com');
}

function netscapeLine(cookie) {
    const domain = cookie.domain || '';
    const includeSubdomains = cookie.hostOnly ? 'FALSE' : 'TRUE';
    const path = cookie.path || '/';
    const secure = cookie.secure ? 'TRUE' : 'FALSE';

    const expiry = cookie.session ||
        !Number.isFinite(cookie.expirationDate)
        ? '0'
        : String(Math.floor(cookie.expirationDate));

    const name = cookie.name || '';
    const value = String(cookie.value ?? '')
        .replace(/[\t\r\n]/g, '');

    return [
        domain,
        includeSubdomains,
        path,
        secure,
        expiry,
        name,
        value
    ].join('\t');
}

function localTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

async function exportCookies() {
    if (exportInProgress) {
        throw new Error('Export already in progress');
    }

    exportInProgress = true;
    let url;

    try {
        const cookies = await browser.cookies.getAll({
            domain: 'youtube.com'
        });

        const items = cookies.filter(isYouTubeCookie);
        const timestamp = localTimestamp();

        const header = [
            '# Netscape HTTP Cookie File',
            '# https://curl.haxx.se/rfc/cookie_spec.html',
            ''
        ].join('\n');

        const body = items.map(netscapeLine).join('\n');
        const content = header + '\n' +
            (body ? `${body}\n` : '');

        const blob = new Blob(
            [content],
            { type: 'text/plain;charset=utf-8' }
        );

        url = URL.createObjectURL(blob);

        await browser.downloads.download({
            url,
            filename: `YT-Cookie-Exporter/youtube-cookies-${timestamp}.txt`,
            saveAs: false,
            conflictAction: 'uniquify'
        });

        await browser.storage.local.set({
            lastExport: timestamp,
            lastCount: items.length,
            lastError: null
        });

        await notifyPopup({
            type: 'export-completed',
            ok: true,
            count: items.length,
            exportedAt: timestamp
        });

        return {
            count: items.length,
            exportedAt: timestamp
        };
    } finally {
        exportInProgress = false;

        if (url) {
            // Laisse au gestionnaire de téléchargements le temps
            // d'utiliser l'URL temporaire.
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
    }
}

async function saveExportError(error) {
    const message = errorMessage(error);

    try {
        await browser.storage.local.set({
            lastError: message
        });
    } catch (storageError) {
        console.error('Unable to save export error:', storageError);
    }

    await notifyPopup({
        type: 'export-completed',
        ok: false,
        count: 0,
        exportedAt: '',
        error: message
    });

    return message;
}

async function configureAlarm(minutes) {
    const interval = Number(minutes);

    if (
        !Number.isInteger(interval) ||
        interval < MIN_INTERVAL ||
        interval > MAX_INTERVAL
    ) {
        throw new Error('Invalid interval');
    }

    await browser.alarms.clear(ALARM_NAME);

    await browser.storage.local.set({
        intervalMinutes: interval,
        enabled: true,
        lastError: null
    });

    browser.alarms.create(ALARM_NAME, {
        delayInMinutes: interval,
        periodInMinutes: interval
    });

    return interval;
}

async function stopAutomation() {
    await browser.alarms.clear(ALARM_NAME);

    await browser.storage.local.set({
        enabled: false
    });

    return { ok: true };
}

async function getStatus() {
    const data = await browser.storage.local.get([
        'intervalMinutes',
        'enabled',
        'lastExport',
        'lastCount',
        'lastError'
    ]);

    return {
        intervalMinutes: data.intervalMinutes ?? DEFAULT_INTERVAL,
        enabled: data.enabled ?? false,
        lastExport: data.lastExport ?? null,
        lastCount: data.lastCount ?? null,
        lastError: data.lastError ?? null
    };
}

async function handleMessage(message) {
    if (!message || typeof message.type !== 'string') {
        return undefined;
    }

    switch (message.type) {
        case 'start': {
            try {
                const interval = await configureAlarm(message.minutes);

                return {
                    ok: true,
                    intervalMinutes: interval
                };
            } catch (error) {
                return {
                    ok: false,
                    error: errorMessage(error)
                };
            }
        }

        case 'stop':
            try {
                return await stopAutomation();
            } catch (error) {
                return {
                    ok: false,
                    error: errorMessage(error)
                };
            }

        case 'export-now':
            try {
                return {
                    ok: true,
                    ...await exportCookies()
                };
            } catch (error) {
                return {
                    ok: false,
                    error: await saveExportError(error)
                };
            }

        case 'status':
            try {
                return await getStatus();
            } catch (error) {
                return {
                    ok: false,
                    error: errorMessage(error)
                };
            }

        default:
            return undefined;
    }
}

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) {
        return;
    }

    exportCookies().catch(saveExportError);
});

browser.runtime.onMessage.addListener((message) =>
    handleMessage(message)
);

browser.runtime.onInstalled.addListener(async () => {
    try {
        const data = await browser.storage.local.get([
            'intervalMinutes',
            'enabled'
        ]);

        if (data.enabled) {
            await configureAlarm(
                data.intervalMinutes ?? DEFAULT_INTERVAL
            );
        }
    } catch (error) {
        try {
            await browser.storage.local.set({
                enabled: false,
                lastError: errorMessage(error)
            });
        } catch (storageError) {
            console.error('Unable to restore automation:', storageError);
        }
    }
});
