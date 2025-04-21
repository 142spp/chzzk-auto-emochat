// --- 상수 정의 ---
const CONSTANTS = {
    STORAGE_KEYS: {
        SETTINGS: 'settings',
        SHORTCUTS: 'shortcuts',
        EMOTICON_CACHE: 'emoticonCache'
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
    },
    DEFAULT_EMOTICONS: [
        // Add your default emoticons here
    ]
};

// --- 이모티콘 관리 클래스 ---
class EmoticonManager {
    constructor() {
        this.emoticonListElement = document.getElementById('emoticonList');
    }

    /**
     * 이모티콘 관리자 초기화 (이벤트 리스너 등록 및 초기 목록 로드)
     */
    async initialize() {
        document.getElementById('selectAllBtn')?.addEventListener('click', () => this.selectAllEmoticons());
        document.getElementById('deselectAllBtn')?.addEventListener('click', () => this.deselectAllEmoticons());
        await this.loadEmoticonList();
    }

    /**
     * 스토리지에서 데이터를 읽어 이모티콘 목록 UI를 생성/갱신합니다.
     */
    async loadEmoticonList() {
        try {
            const result = await chrome.storage.local.get([
                CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE
            ]);
            
            const emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
            
            console.log(`로드된 이모티콘 ${emoticons.length}개`);

            this.emoticonListElement.innerHTML = '';
            let selectedCount = 0;

            emoticons.forEach((emoticon) => {
                const item = document.createElement('div');
                item.className = 'emoticon-item';
                item.dataset.name = emoticon.name;
                
                const img = document.createElement('img');
                img.src = emoticon.url;
                img.alt = emoticon.name;
                img.title = emoticon.name;

                const removeBtn = document.createElement('span');
                removeBtn.className = 'remove-btn';
                removeBtn.textContent = '×';
                removeBtn.title = '이모티콘 제거';
                removeBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.removeEmoticon(emoticon.name);
                });

                item.appendChild(img);
                item.appendChild(removeBtn);
                item.addEventListener('click', () => this.toggleEmoticonSelection(emoticon.name));

                if (emoticon.selected) {
                    item.classList.add('selected');
                    selectedCount++;
                }

                this.emoticonListElement.appendChild(item);
            });

            console.log(`이모티콘 목록 UI 생성 완료, 선택됨: ${selectedCount}개`);
            this.updateSelectionButtonStates(selectedCount, emoticons.length);

        } catch (error) {
            console.error("이모티콘 목록 로드 실패:", error);
            this.showStatus("이모티콘 목록 로드 실패", true);
        }
    }

    /**
     * 이모티콘 선택 상태를 토글합니다.
     * @param {string} nameToToggle - 토글할 이모티콘의 이름
     */
    async toggleEmoticonSelection(nameToToggle) {
        try {
            const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
            let emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
            
            const emoticon = emoticons.find(e => e.name === nameToToggle);
            if (emoticon) {
                emoticon.selected = !emoticon.selected;
                console.log(`이모티콘 "${nameToToggle}" 선택 상태 변경: ${emoticon.selected}`);

                await chrome.storage.local.set({
                    [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: emoticons
                });

                const itemElement = this.emoticonListElement.querySelector(`[data-name="${nameToToggle}"]`);
                if (itemElement) {
                    itemElement.classList.toggle('selected', emoticon.selected);
                }

                const selectedCount = emoticons.filter(e => e.selected).length;
                this.updateSelectionButtonStates(selectedCount, emoticons.length);
                const status = emoticon.selected ? "선택됨" : "선택 해제됨";
                this.showStatus(`이모티콘 ${status}`, false);

                this.notifyContentScriptCacheUpdate();

            } else {
                console.warn(`이름 "${nameToToggle}"에 해당하는 이모티콘을 찾을 수 없습니다.`);
                this.showStatus("이모티콘 상태 변경 실패", true);
            }

        } catch (error) {
            console.error('이모티콘 선택 토글 중 오류:', error);
            this.showStatus("이모티콘 선택 변경 실패", true);
        }
    }

    /**
     * 선택/해제 버튼 상태를 업데이트합니다.
     * @param {number} selectedCount - 선택된 이모티콘 수
     * @param {number} totalCount - 전체 이모티콘 수
     */
    updateSelectionButtonStates(selectedCount, totalCount) {
        const selectAllBtn = document.getElementById('selectAllBtn');
        const deselectAllBtn = document.getElementById('deselectAllBtn');
        
        if (selectAllBtn) {
            selectAllBtn.disabled = selectedCount === totalCount && totalCount > 0;
        }
        if (deselectAllBtn) {
            deselectAllBtn.disabled = selectedCount === 0;
        }
    }

    /**
     * 특정 이름의 이모티콘을 캐시에서 제거합니다.
     * @param {string} nameToRemove - 제거할 이모티콘의 이름
     */
    async removeEmoticon(nameToRemove) {
        try {
            const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
            let emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];

            const arrayIndexToRemove = emoticons.findIndex(e => e.name === nameToRemove);

            if (arrayIndexToRemove === -1) {
                 console.warn(`제거할 이모티콘 이름 "${nameToRemove}" 찾기 실패`);
                 this.showStatus("이모티콘 제거 실패", true);
                 return;
            }

            const removedEmoticon = emoticons.splice(arrayIndexToRemove, 1)[0];
            console.log(`이모티콘 "${nameToRemove}" 제거됨`);

            await chrome.storage.local.set({
                [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: emoticons
            });

            await this.loadEmoticonList();
            this.showStatus(`이모티콘 "${removedEmoticon.name}" 제거됨`, false);
            this.notifyContentScriptCacheUpdate();

        } catch (error) {
            console.error("이모티콘 제거 중 오류:", error);
            this.showStatus("이모티콘 제거 중 오류 발생", true);
        }
    }

    /**
     * 모든 이모티콘을 선택합니다.
     */
    async selectAllEmoticons() {
         try {
             const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
             let emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];

             if (emoticons.length === 0) return;

             emoticons.forEach(e => e.selected = true);

             await chrome.storage.local.set({
                 [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: emoticons
             });

             await this.loadEmoticonList();
             this.showStatus("모든 이모티콘 선택됨", false);

             this.notifyContentScriptCacheUpdate();

         } catch (error) {
             console.error('[selectAllEmoticons] 전체 선택 중 오류:', error);
             this.showStatus("전체 선택 중 오류 발생", true);
         }
    }

    /**
     * 모든 이모티콘 선택을 해제합니다.
     */
    async deselectAllEmoticons() {
         try {
             const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
             let emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];

             if (emoticons.length === 0) return;

             let changed = false;
             emoticons.forEach(e => {
                 if (e.selected) {
                     e.selected = false;
                     changed = true;
                 }
             });

             if (changed) {
                 await chrome.storage.local.set({
                     [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: emoticons
                 });

                 await this.loadEmoticonList();
                 this.showStatus("모든 이모티콘 선택 해제됨", false);

                 this.notifyContentScriptCacheUpdate();
             } else {
                 this.showStatus("선택된 이모티콘이 없습니다.", false);
             }

         } catch (error) {
             console.error('[deselectAllEmoticons] 전체 해제 중 오류:', error);
             this.showStatus("전체 해제 중 오류 발생", true);
         }
    }

    /**
     * content.js에 이모티콘 캐시가 업데이트되었음을 알립니다.
     */
    async notifyContentScriptCacheUpdate() {
        try {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
                url: "*://*.chzzk.naver.com/*"
            });

            if (tabs.length > 0) {
                const tabId = tabs[0].id;
                chrome.tabs.sendMessage(tabId, { action: "emoticonCacheUpdated" })
                    .then(() => console.log("Content script에 캐시 업데이트 알림 전송 성공"))
                    .catch(err => {
                        if (err.message?.includes("Receiving end does not exist")) {
                            console.warn("Content script 연결 불가 (탭 로딩 중이거나 관련 없는 페이지일 수 있음)");
                        } else {
                            console.error("Content script 알림 전송 실패:", err);
                        }
                    });
            } else {
                console.log("알림 전송 가능한 치지직 탭 없음");
            }
        } catch (error) {
            console.error("Content script 알림 전송 중 오류:", error);
        }
    }

    showStatus(message, isError = false) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = isError ? 'error' : 'success';
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = '';
        }, 3000);
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
            this.showStatus('설정 로드 중 오류가 발생했습니다.', true);
        }
    }

    /**
     * 설정값의 유효성을 검사합니다.
     * @returns {{isValid: boolean, errorMessage: string}} 유효성 검사 결과
     */
    validateSettings() {
        const { minRepetitions, maxRepetitions, minDelay, maxDelay } = this.settings;

        if (minRepetitions < 1 || maxRepetitions < 1) 
            return { isValid: false, errorMessage: '반복 횟수는 1 이상이어야 합니다.' };
        if (minRepetitions > 100 || maxRepetitions > 100)
            return { isValid: false, errorMessage: '반복 횟수는 100 이하여야 합니다.' };
        if (minDelay < 1000 || maxDelay < 1000) 
            return { isValid: false, errorMessage: '자동 입력 간격은 1000ms 이상이어야 합니다.' };
        if (minDelay > 9999 || maxDelay > 9999)
            return { isValid: false, errorMessage: '자동 입력 간격은 9999ms 이하여야 합니다.' };
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
        document.getElementById('minRepetitions').value = this.settings.minRepetitions;
        document.getElementById('maxRepetitions').value = this.settings.maxRepetitions;
        document.getElementById('minDelay').value = this.settings.minDelay;
        document.getElementById('maxDelay').value = this.settings.maxDelay;
        document.getElementById('shortcutDisplayManual').textContent = this.shortcuts.manual;
        document.getElementById('shortcutDisplayAuto').textContent = this.shortcuts.auto;
    }

    /**
     * UI에서 설정을 가져옵니다.
     */
    getSettingsFromUI() {
        this.settings.minRepetitions = parseInt(document.getElementById('minRepetitions').value) || CONSTANTS.DEFAULT_SETTINGS.minRepetitions;
        this.settings.maxRepetitions = parseInt(document.getElementById('maxRepetitions').value) || CONSTANTS.DEFAULT_SETTINGS.maxRepetitions;
        this.settings.minDelay = parseInt(document.getElementById('minDelay').value) || CONSTANTS.DEFAULT_SETTINGS.minDelay;
        this.settings.maxDelay = parseInt(document.getElementById('maxDelay').value) || CONSTANTS.DEFAULT_SETTINGS.maxDelay;
    }

    showStatus(message, isError = false) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = isError ? 'error' : 'success';
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = '';
        }, 3000);
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
        document.getElementById('save')?.addEventListener('click', async () => {
            this.settingsManager.getSettingsFromUI();
            const result = await this.settingsManager.saveSettings();
            
            if (result.success) {
                this.settingsManager.showStatus('설정이 저장되었습니다.', false);
            } else {
                this.settingsManager.showStatus(result.errorMessage, true);
            }
        });

        document.getElementById('shortcutButton')?.addEventListener('click', () => {
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