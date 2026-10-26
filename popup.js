const $ = (id) => document.getElementById(id);

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 10080;

function t(key, substitutions = []) {
    return browser.i18n.getMessage(key, substitutions) || key;
}

function setStatus(message) {
    const status = $('status');

    if (status) {
        status.textContent = message;
    }
}

function errorText(error) {
    return String(error?.message || error || t('unknownError'));
}

async function sendMessage(type, data = {}) {
    const response = await browser.runtime.sendMessage({
        type,
        ...data
    });

    if (response?.ok === false) {
        throw new Error(response.error || t('unknownError'));
    }

    return response;
}

async function refresh(extra = '') {
    const status = await sendMessage('status');

    if ($('minutes')) {
        $('minutes').value = status.intervalMinutes;
    }

    const lines = [
        t(status.enabled ? 'automationActive' : 'automationStopped'),
        t('intervalStatus', [String(status.intervalMinutes)]),

        status.lastExport
            ? t('lastExportStatus', [
                String(status.lastExport),
                String(status.lastCount ?? 0)
            ])
            : t('noExport'),

        status.lastError
            ? t('errorStatus', [String(status.lastError)])
            : '',

        extra
    ];

    setStatus(lines.filter(Boolean).join('\n'));
}

function showError(error, messageKey = 'initializationError') {
    setStatus(t(messageKey, [errorText(error)]));
}

async function startAutomation() {
    const minutes = Number($('minutes')?.value);

    if (
        !Number.isInteger(minutes) ||
        minutes < MIN_INTERVAL ||
        minutes > MAX_INTERVAL
    ) {
        setStatus(t('invalidInterval'));
        return;
    }

    try {
        await sendMessage('start', { minutes });
        await refresh(t('intervalSaved'));
    } catch (error) {
        showError(error);
    }
}

async function stopAutomation() {
    try {
        await sendMessage('stop');
        await refresh();
    } catch (error) {
        showError(error);
    }
}

async function exportNow() {
    setStatus(t('exportInProgress'));

    try {
        const result = await sendMessage('export-now');

        await refresh(
            t('exportCompleted', [String(result.count)])
        );
    } catch (error) {
        try {
            await refresh(
                t('exportFailed', [errorText(error)])
            );
        } catch {
            showError(error, 'exportFailed');
        }
    }
}

function localizeHtml() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const key = element.dataset.i18n;
        const message = t(key);

        if (message !== key) {
            element.textContent = message;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        const key = element.dataset.i18nPlaceholder;
        const message = t(key);

        if (message !== key) {
            element.setAttribute('placeholder', message);
        }
    });
}

function bindEvents() {
    $('start')?.addEventListener('click', startAutomation);
    $('stop')?.addEventListener('click', stopAutomation);
    $('now')?.addEventListener('click', exportNow);
}

browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'export-completed') {
        refresh().catch((error) => showError(error));
    }
});

async function initialize() {
    localizeHtml();
    bindEvents();

    try {
        await refresh();
    } catch (error) {
        showError(error);
    }
}

initialize();
