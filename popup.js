// --- 상수 정의 ---
const CONSTANTS = {
    STORAGE_KEYS: {
        SETTINGS: 'settings',
        SHORTCUTS: 'shortcuts',
        EMOTICON_CACHE: 'emoticonCache',
        SELECTED_EMOTICONS: 'selectedEmoticons'
    },
    DEFAULT_SETTINGS: {
        minRepetitions: 4,
        maxRepetitions: 8,
        minDelay: 2000,
        maxDelay: 3000
    },
    DEFAULT_SHORTCUTS: {
        manual: 'Alt+Q',
        auto: 'Alt+W'
    }
};

// --- 이모티콘 관리 클래스 ---
class EmoticonManager {
    constructor() {
        this.selectedEmoticons = new Set();
        this.emoticonList = document.getElementById('emoticonList');
        this.selectAllBtn = document.getElementById('selectAllBtn');
        this.deselectAllBtn = document.getElementById('deselectAllBtn');
    }

    /**
     * 이모티콘 목록을 초기화합니다.
     */
    async initialize() {
        // 이벤트 리스너 등록
        this.selectAllBtn.addEventListener('click', () => this.selectAllEmoticons());
        this.deselectAllBtn.addEventListener('click', () => this.deselectAllEmoticons());

        // 이모티콘 목록 가져오기
        await this.loadEmoticonList();
    }

    /**
     * 이모티콘 목록을 로드합니다.
     */
    async loadEmoticonList() {
        try {
            const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
            const emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
            
            // 이모티콘 목록 비우기
            this.emoticonList.innerHTML = '';
            
            // 각 이모티콘에 대한 UI 요소 생성
            emoticons.forEach((emoticon, index) => {
                const item = document.createElement('div');
                item.className = 'emoticon-item';
                item.dataset.index = index;
                
                const img = document.createElement('img');
                img.src = emoticon.url;
                img.alt = emoticon.name;
                
                item.appendChild(img);
                item.addEventListener('click', () => this.toggleEmoticonSelection(index));
                
                this.emoticonList.appendChild(item);
            });

            // 선택 상태 복원
            await this.restoreSelectionState();
        } catch (error) {
            console.error('이모티콘 목록 로드 중 오류:', error);
        }
    }

    /**
     * 이모티콘 선택 상태를 토글합니다.
     * @param {number} index - 이모티콘 인덱스
     */
    toggleEmoticonSelection(index) {
        if (this.selectedEmoticons.has(index)) {
            this.selectedEmoticons.delete(index);
        } else {
            this.selectedEmoticons.add(index);
        }
        this.updateSelectionUI();
        this.saveSelectionState();
    }

    /**
     * 선택 상태 UI를 업데이트합니다.
     */
    updateSelectionUI() {
        const items = document.querySelectorAll('.emoticon-item');
        items.forEach((item, index) => {
            if (this.selectedEmoticons.has(index)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * 선택 상태를 복원합니다.
     */
    async restoreSelectionState() {
        try {
            const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS]);
            if (result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS]) {
                this.selectedEmoticons = new Set(result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS]);
                this.updateSelectionUI();
            } else {
                // 기본적으로 모든 이모티콘 선택
                this.selectAllEmoticons();
            }
        } catch (error) {
            console.error('선택 상태 복원 중 오류:', error);
        }
    }

    /**
     * 선택 상태를 저장합니다.
     */
    async saveSelectionState() {
        try {
            await chrome.storage.local.set({
                [CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS]: Array.from(this.selectedEmoticons)
            });
        } catch (error) {
            console.error('선택 상태 저장 중 오류:', error);
        }
    }

    /**
     * 모든 이모티콘을 선택합니다.
     */
    selectAllEmoticons() {
        const items = document.querySelectorAll('.emoticon-item');
        this.selectedEmoticons = new Set(Array.from({length: items.length}, (_, i) => i));
        this.updateSelectionUI();
        this.saveSelectionState();
    }

    /**
     * 모든 이모티콘 선택을 해제합니다.
     */
    deselectAllEmoticons() {
        this.selectedEmoticons.clear();
        this.updateSelectionUI();
        this.saveSelectionState();
    }

    /**
     * 선택된 이모티콘 목록을 가져옵니다.
     * @returns {Promise<Array<{name: string, url: string}>>}
     */
    async getSelectedEmoticons() {
        try {
            const result = await chrome.storage.local.get([
                CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE,
                CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS
            ]);
            
            const emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
            const selectedIndices = result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS] || [];
            
            return emoticons.filter((_, index) => selectedIndices.includes(index));
        } catch (error) {
            console.error('선택된 이모티콘 가져오기 중 오류:', error);
            return [];
        }
    }
}

// --- 설정 관리 클래스 ---
class SettingsManager {
    constructor() {
        this.settings = { ...CONSTANTS.DEFAULT_SETTINGS };
        this.shortcuts = { ...CONSTANTS.DEFAULT_SHORTCUTS };
    }

    /**
     * 설정을 로드합니다.
     */
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                CONSTANTS.STORAGE_KEYS.SETTINGS,
                CONSTANTS.STORAGE_KEYS.SHORTCUTS
            ]);
            
            this.settings = { ...this.settings, ...result[CONSTANTS.STORAGE_KEYS.SETTINGS] };
            this.shortcuts = { ...this.shortcuts, ...result[CONSTANTS.STORAGE_KEYS.SHORTCUTS] };
            
            this.updateUI();
        } catch (error) {
            console.error('설정 로드 중 오류:', error);
            UIManager.showStatus('설정 로드 중 오류가 발생했습니다.', 'error');
        }
    }

    /**
     * 설정값의 유효성을 검사합니다.
     * @returns {{isValid: boolean, errorMessage: string}} 유효성 검사 결과
     */
    validateSettings() {
        const { minRepetitions, maxRepetitions, minDelay, maxDelay } = this.settings;

        // 반복 횟수 검사
        if (minRepetitions < 1 || maxRepetitions < 1) 
            return { isValid: false, errorMessage: '반복 횟수는 1 이상이어야 합니다.' };
        if (minRepetitions > 100 || maxRepetitions > 100)
            return { isValid: false, errorMessage: '반복 횟수는 100 이하여야 합니다.' };
        // 딜레이 검사
        if (minDelay < 500 || maxDelay < 500) 
            return { isValid: false, errorMessage: '자동 입력 간격은 500ms 이상이어야 합니다.' };
        if (minDelay > 9999 || maxDelay > 9999)
            return { isValid: false, errorMessage: '자동 입력 간격은 9999ms 이하여야 합니다.' };
        // 최소값이 최대값보다 큰 경우 검사
        if (minRepetitions > maxRepetitions) 
            return { isValid: false, errorMessage: '최소값이 최대값보다 클 수 없습니다.' };
        if (minDelay > maxDelay)
            return { isValid: false, errorMessage: '최소값이 최대값보다 클 수 없습니다.' };

        return { isValid: true, errorMessage: '' };
    }

    /**
     * 설정을 저장합니다.
     * @returns {{success: boolean, errorMessage: string}} 저장 결과
     */
    async saveSettings() {
        try {
            // 설정값 유효성 검사
            const validation = this.validateSettings();
            if (!validation.isValid) {
                return { success: false, errorMessage: validation.errorMessage };
            }

            await chrome.storage.sync.set({
                [CONSTANTS.STORAGE_KEYS.SETTINGS]: this.settings,
                [CONSTANTS.STORAGE_KEYS.SHORTCUTS]: this.shortcuts
            });
            return { success: true, errorMessage: '' };
        } catch (error) {
            console.error('설정 저장 중 오류:', error);
            let errorMessage = '알 수 없는 오류가 발생했습니다.';
            
            if (error.message.includes('QuotaExceededError')) {
                errorMessage = '저장 공간이 부족합니다.';
            } else if (error.message.includes('NetworkError')) {
                errorMessage = '네트워크 연결을 확인해주세요.';
            }
            
            return { success: false, errorMessage };
        }
    }

    /**
     * UI를 업데이트합니다.
     */
    updateUI() {
        // 설정값 업데이트
        document.getElementById('minRepetitions').value = this.settings.minRepetitions;
        document.getElementById('maxRepetitions').value = this.settings.maxRepetitions;
        document.getElementById('minDelay').value = this.settings.minDelay;
        document.getElementById('maxDelay').value = this.settings.maxDelay;
        
        // 단축키 업데이트
        document.getElementById('shortcutDisplayManual').textContent = this.shortcuts.manual;
        document.getElementById('shortcutDisplayAuto').textContent = this.shortcuts.auto;
    }

    /**
     * UI에서 설정을 가져옵니다.
     */
    getSettingsFromUI() {
        this.settings.minRepetitions = parseInt(document.getElementById('minRepetitions').value) || 1;
        this.settings.maxRepetitions = parseInt(document.getElementById('maxRepetitions').value) || 1;
        this.settings.minDelay = parseInt(document.getElementById('minDelay').value) || 3000;
        this.settings.maxDelay = parseInt(document.getElementById('maxDelay').value) || 6000;
    }
}

// --- UI 관리 클래스 ---
class UIManager {
    /**
     * 상태 메시지를 표시합니다.
     * @param {string} message - 메시지 내용
     * @param {string} [type='info'] - 메시지 타입 (info, success, error)
     */
    static showStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = 'status';
        }, 3000);
    }
}

// --- 이벤트 핸들러 클래스 ---
class EventHandler {
    constructor(settingsManager, emoticonManager) {
        this.settingsManager = settingsManager;
        this.emoticonManager = emoticonManager;
    }

    /**
     * 이벤트 리스너를 초기화합니다.
     */
    initializeEventListeners() {
        // 저장 버튼 이벤트
        document.getElementById('save').addEventListener('click', async () => {
            this.settingsManager.getSettingsFromUI();
            const result = await this.settingsManager.saveSettings();
            
            if (result.success) {
                UIManager.showStatus('설정이 저장되었습니다.', 'success');
            } else {
                UIManager.showStatus(result.errorMessage, 'error');
            }
        });

        // 단축키 설정 버튼 이벤트
        document.getElementById('shortcutButton').addEventListener('click', () => {
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        });
    }
}

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', async () => {
    const settingsManager = new SettingsManager();
    const emoticonManager = new EmoticonManager();
    const eventHandler = new EventHandler(settingsManager, emoticonManager);
    
    await settingsManager.loadSettings();
    await emoticonManager.initialize();
    eventHandler.initializeEventListeners();
});