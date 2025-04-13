// --- 상수 정의 ---
const CONSTANTS = {
    SELECTORS: {
        MIN_REPETITIONS: 'minRepetitions',
        MAX_REPETITIONS: 'maxRepetitions',
        MIN_DELAY: 'minDelay',
        MAX_DELAY: 'maxDelay',
        SAVE_BUTTON: 'save',
        STATUS_DIV: 'status',
        SHORTCUT_DISPLAY_MANUAL: 'shortcutDisplayManual',
        SHORTCUT_DISPLAY_AUTO: 'shortcutDisplayAuto'
    },
    LIMITS: {
        MIN_REPETITIONS: 1,
        MAX_REPETITIONS: 100,
        MIN_DELAY: 500
    },
    DEFAULTS: {
        MIN_REPETITIONS: 1,
        MAX_REPETITIONS: 1,
        MIN_DELAY: 2000,
        MAX_DELAY: 3000
    },
    SHORTCUTS: {
        MANUAL: 'Ctrl+Shift+E (기본값)',
        AUTO: 'Ctrl+Shift+R (기본값)'
    }
};

// --- UI 관리 클래스 ---
class UIManager {
    constructor() {
        this.elements = {};
        this.initializeElements();
    }

    initializeElements() {
        Object.entries(CONSTANTS.SELECTORS).forEach(([key, id]) => {
            this.elements[key] = document.getElementById(id);
        });
    }

    showStatus(message, type = 'success') {
        const { STATUS_DIV } = this.elements;
        STATUS_DIV.textContent = message;
        STATUS_DIV.className = type;
        
        setTimeout(() => {
            STATUS_DIV.className = '';
            STATUS_DIV.textContent = '';
        }, 3000);
    }

    updateShortcutDisplay(manualShortcut, autoShortcut) {
        const { SHORTCUT_DISPLAY_MANUAL, SHORTCUT_DISPLAY_AUTO } = this.elements;
        SHORTCUT_DISPLAY_MANUAL.textContent = manualShortcut || CONSTANTS.SHORTCUTS.MANUAL;
        SHORTCUT_DISPLAY_AUTO.textContent = autoShortcut || CONSTANTS.SHORTCUTS.AUTO;
    }

    getInputValues() {
        const { MIN_REPETITIONS, MAX_REPETITIONS, MIN_DELAY, MAX_DELAY } = this.elements;
        return {
            minRepetitions: parseInt(MIN_REPETITIONS.value, 10),
            maxRepetitions: parseInt(MAX_REPETITIONS.value, 10),
            minDelay: parseInt(MIN_DELAY.value, 10),
            maxDelay: parseInt(MAX_DELAY.value, 10)
        };
    }

    setInputValues(values) {
        const { MIN_REPETITIONS, MAX_REPETITIONS, MIN_DELAY, MAX_DELAY } = this.elements;
        MIN_REPETITIONS.value = values.minRepetitions || CONSTANTS.DEFAULTS.MIN_REPETITIONS;
        MAX_REPETITIONS.value = values.maxRepetitions || CONSTANTS.DEFAULTS.MAX_REPETITIONS;
        MIN_DELAY.value = values.minDelay || CONSTANTS.DEFAULTS.MIN_DELAY;
        MAX_DELAY.value = values.maxDelay || CONSTANTS.DEFAULTS.MAX_DELAY;
    }
}

// --- 설정 관리 클래스 ---
class SettingsManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    async loadSettings() {
        try {
            const settings = await chrome.storage.sync.get([
                'minRepetitions',
                'maxRepetitions',
                'minDelay',
                'maxDelay'
            ]);
            this.uiManager.setInputValues(settings);

            const commands = await chrome.commands.getAll();
            const manualCommand = commands.find(cmd => cmd.name === 'trigger-emoticon');
            const autoCommand = commands.find(cmd => cmd.name === 'toggle-auto-send');
            
            this.uiManager.updateShortcutDisplay(
                manualCommand?.shortcut,
                autoCommand?.shortcut
            );
        } catch (error) {
            console.error('설정 로드 중 오류 발생:', error);
            this.uiManager.showStatus('설정 로드 실패', 'error');
        }
    }

    validateSettings(values) {
        const { MIN_REPETITIONS, MAX_REPETITIONS, MIN_DELAY } = CONSTANTS.LIMITS;

        // 반복 횟수 유효성 검사
        if (isNaN(values.minRepetitions) || isNaN(values.maxRepetitions) || 
            values.minRepetitions < MIN_REPETITIONS || values.maxRepetitions < MIN_REPETITIONS) {
            this.uiManager.showStatus('반복 횟수는 1 이상이어야 합니다.', 'error');
            return false;
        }
        if (values.minRepetitions > MAX_REPETITIONS || values.maxRepetitions > MAX_REPETITIONS) {
            this.uiManager.showStatus('반복 횟수는 100 이하여야 합니다.', 'error');
            return false;
        }
        if (values.minRepetitions > values.maxRepetitions) {
            this.uiManager.showStatus('최대 반복 횟수는 최소 반복 횟수보다 크거나 같아야 합니다.', 'error');
            return false;
        }

        // 딜레이 유효성 검사
        if (isNaN(values.minDelay) || isNaN(values.maxDelay)) {
            this.uiManager.showStatus('자동 입력 간격은 숫자여야 합니다.', 'error');
            return false;
        }
        if (values.minDelay < MIN_DELAY || values.maxDelay < MIN_DELAY) {
            this.uiManager.showStatus('자동 입력 간격은 500ms 이상이어야 합니다.', 'error');
            return false;
        }
        if (values.minDelay > values.maxDelay) {
            this.uiManager.showStatus('최대 간격은 최소 간격보다 크거나 같아야 합니다.', 'error');
            return false;
        }

        return true;
    }

    async saveSettings() {
        try {
            const values = this.uiManager.getInputValues();
            
            if (!this.validateSettings(values)) {
                return;
            }

            await chrome.storage.sync.set(values);
            this.uiManager.showStatus('설정이 저장되었습니다!', 'success');
            
            await chrome.runtime.sendMessage({ action: "settingsUpdated" })
                .catch(e => console.log("Background 메시지 전송 실패:", e));
        } catch (error) {
            console.error('설정 저장 중 오류 발생:', error);
            this.uiManager.showStatus('설정 저장 실패', 'error');
        }
    }
}

// --- 이벤트 핸들러 클래스 ---
class EventHandler {
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }

    initializeEventListeners() {
        const { SAVE_BUTTON } = CONSTANTS.SELECTORS;
        const saveButton = document.getElementById(SAVE_BUTTON);
        const shortcutLink = document.querySelector('a[href="chrome://extensions/shortcuts"]');

        document.addEventListener('DOMContentLoaded', () => {
            this.settingsManager.loadSettings();
        });

        saveButton.addEventListener('click', () => {
            this.settingsManager.saveSettings();
        });

        if (shortcutLink) {
            shortcutLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: e.target.href });
            });
        }
    }
}

// --- 초기화 ---
const uiManager = new UIManager();
const settingsManager = new SettingsManager(uiManager);
const eventHandler = new EventHandler(settingsManager);

eventHandler.initializeEventListeners();