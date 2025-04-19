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
    },
    DEFAULT_EMOTICONS: [
        // Add your default emoticons here
    ]
};

// --- 이모티콘 관리 클래스 ---
class EmoticonManager {
    constructor() {
        this.emoticonList = document.getElementById('emoticonList');
        this.selectAllBtn = document.getElementById('selectAllBtn');
        this.deselectAllBtn = document.getElementById('deselectAllBtn');
    }

    /**
     * 이모티콘 관리자 초기화 (이벤트 리스너 등록 및 초기 목록 로드)
     */
    async initialize() {
        // 이벤트 리스너 등록
        if (this.selectAllBtn) {
            this.selectAllBtn.addEventListener('click', () => this.selectAllEmoticons());
        }
        if (this.deselectAllBtn) {
            this.deselectAllBtn.addEventListener('click', () => this.deselectAllEmoticons());
        }
        // 초기 이모티콘 목록 로드
        await this.loadEmoticonList();
    }

    /**
     * 스토리지에서 데이터를 읽어 이모티콘 목록 UI를 생성/갱신합니다.
     */
    async loadEmoticonList() {
        try {
            console.log("이모티콘 목록 로드 중...");
            
            // 1. 스토리지에서 이모티콘 캐시와 선택 상태 로드
            const result = await chrome.storage.local.get([
                CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE,
                CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS
            ]);
            
            const emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
            const selectedIndices = new Set(result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS] || []);
            
            console.log(`이모티콘 ${emoticons.length}개, 선택됨 ${selectedIndices.size}개`);

            // 2. 이모티콘 목록 UI 초기화
            this.emoticonList.innerHTML = '';

            // 3. 각 이모티콘에 대한 UI 요소 생성
            emoticons.forEach((emoticon, index) => {
                // 3.1 이모티콘 아이템 컨테이너 생성
                const item = document.createElement('div');
                item.className = 'emoticon-item';
                item.dataset.index = index; // 인덱스 저장
                
                // 3.2 이모티콘 이미지 생성
                const img = document.createElement('img');
                img.src = emoticon.url;
                img.alt = emoticon.name;
                img.title = emoticon.name; // 툴팁 추가

                // 3.3 삭제 버튼 추가
                const removeBtn = document.createElement('span');
                removeBtn.className = 'remove-btn';
                removeBtn.textContent = '×';
                removeBtn.title = '이모티콘 제거';
                removeBtn.addEventListener('click', (event) => {
                    event.stopPropagation(); // 이벤트 버블링 방지
                    this.removeEmoticon(index);
                });

                // 3.4 컴포넌트 조립
                item.appendChild(img);
                item.appendChild(removeBtn);
                
                // 3.5 클릭 이벤트 추가 (선택/해제 토글)
                item.addEventListener('click', () => this.toggleEmoticonSelection(index));

                // 3.6 선택 상태 적용
                if (selectedIndices.has(index)) {
                    item.classList.add('selected');
                }

                // 3.7 DOM에 추가
                this.emoticonList.appendChild(item);
            });

            console.log("이모티콘 목록 UI 생성 완료");

        } catch (error) {
            console.error("이모티콘 목록 로드 실패:", error);
            UIManager.showStatus("이모티콘 목록 로드 실패", "error");
        }
    }

    /**
     * 이모티콘 선택 상태를 토글합니다.
     * @param {number} index - 토글할 이모티콘의 인덱스
     */
    async toggleEmoticonSelection(index) {
        try {
            // 1. 현재 선택 상태 로드
            const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS]);
            let selectedIndices = new Set(result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS] || []);
            
            // 2. 토글 처리
            if (selectedIndices.has(index)) {
                selectedIndices.delete(index); // 선택 해제
                console.log(`이모티콘 #${index} 선택 해제됨`);
            } else {
                selectedIndices.add(index); // 선택
                console.log(`이모티콘 #${index} 선택됨`);
            }

            // 3. 변경사항 저장 및 UI 업데이트
            await this.saveSelectionState(selectedIndices);
            this.updateSelectionUI(selectedIndices);
            
            // 4. 알림 표시 (선택사항)
            const status = selectedIndices.has(index) ? "선택됨" : "선택 해제됨";
            UIManager.showStatus(`이모티콘 ${status}`, "info");

        } catch (error) {
            console.error('이모티콘 선택 토글 중 오류:', error);
            UIManager.showStatus("이모티콘 선택 변경 실패", "error");
        }
    }

    /**
     * 선택 상태 UI를 즉시 업데이트합니다. (스토리지 읽기 없이)
     * @param {Set<number>} selectedIndices - 현재 선택된 인덱스 Set
     */
    updateSelectionUI(selectedIndices) {
        // 모든 이모티콘 항목에 선택 상태 적용
        const items = this.emoticonList.querySelectorAll('.emoticon-item');
        items.forEach((item) => {
            const index = parseInt(item.dataset.index, 10);
            
            // 선택 상태에 따라 클래스 추가/제거
            if (selectedIndices.has(index)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        console.log(`UI 업데이트: ${selectedIndices.size}개 이모티콘 선택됨`);
        
        // 선택된 이모티콘 수에 따라 버튼 활성화/비활성화 (선택사항)
        this.updateSelectionButtonStates(selectedIndices.size);
    }
    
    /**
     * 선택/해제 버튼 상태를
     * @param {number} selectedCount - 선택된 이모티콘 수
     */
    updateSelectionButtonStates(selectedCount) {
        // "전체 선택" 버튼 상태 업데이트
        if (this.selectAllBtn) {
            this.selectAllBtn.disabled = false;
        }
        
        // "전체 해제" 버튼 상태 업데이트
        if (this.deselectAllBtn) {
            this.deselectAllBtn.disabled = selectedCount === 0;
        }
    }


    /**
     * 선택 상태를 스토리지에 저장하고 content.js에 알립니다.
     * @param {Set<number>} selectedIndices - 저장할 선택된 인덱스 Set
     */
    async saveSelectionState(selectedIndices) {
        try {
            // 1. 배열로 변환
            const selectionArray = Array.from(selectedIndices);
            
            // 2. 로컬 스토리지에 저장
            await chrome.storage.local.set({
                [CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS]: selectionArray
            });
            console.log(`선택 상태 저장됨: ${selectionArray.length}개 이모티콘 선택`);
            
            // 3. 활성 탭의 content.js에 알림
            try {
                const tabs = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                    url: "*://*.chzzk.naver.com/*"
                });
                
                if (tabs.length > 0) {
                    // 메시지 전송 (비동기)
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "updateSelectedEmoticons",
                        selectedIndices: selectionArray
                    }).then(() => {
                        console.log("선택 상태 알림 전송 성공");
                    }).catch(err => {
                        console.error("선택 상태 알림 전송 실패:", err);
                    });
                } else {
                    console.log("알림 전송 가능한 치지직 탭 없음");
                }
            } catch (error) {
                console.error("선택 상태 알림 전송 중 오류:", error);
            }
        } catch (error) {
            console.error('선택 상태 저장 중 오류:', error);
            UIManager.showStatus("선택 상태 저장 실패", "error");
        }
    }

     /**
     * 특정 인덱스의 이모티콘을 캐시와 선택 상태에서 제거합니다.
     * @param {number} indexToRemove - 제거할 이모티콘의 인덱스
     */
     async removeEmoticon(indexToRemove) {
        try {
            // 스토리지에서 현재 데이터 가져오기
            const result = await chrome.storage.local.get([
                CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE,
                CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS
            ]);
            let emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
            let selectedIndicesSet = new Set(result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS] || []);

            // 인덱스 유효성 검사
            if (indexToRemove < 0 || indexToRemove >= emoticons.length) {
                return;
            }

            // 메모리에서 제거 (로컬 변수)
            const removedEmoticon = emoticons.splice(indexToRemove, 1)[0];

            // 선택 상태 업데이트 (삭제된 인덱스 이후의 인덱스들을 조정)
            const newSelectedIndices = new Set();
            for (const selectedIndex of selectedIndicesSet) {
                if (selectedIndex < indexToRemove) {
                    newSelectedIndices.add(selectedIndex);
                } else if (selectedIndex > indexToRemove) {
                    newSelectedIndices.add(selectedIndex - 1); // 인덱스 1 감소
                }
            }
            
            // 변경된 캐시와 선택 상태를 스토리지에 저장
            await chrome.storage.local.set({
                [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: emoticons, // 수정된 캐시 저장
                [CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS]: Array.from(newSelectedIndices) // 수정된 선택 상태 저장
            });

            // UI 갱신 (목록을 다시 로드하여 스토리지 최신 상태 반영)
            await this.loadEmoticonList();

            // content.js에 알림
            this.notifyContentScriptCacheUpdate();

        } catch (error) {
            UIManager.showStatus("이모티콘 제거 중 오류 발생", "error");
        }
    }

    /**
     * 모든 이모티콘을 선택합니다.
     */
    async selectAllEmoticons() {
        try {
            // 전체 개수 확인을 위해 캐시 로드
             const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
             const emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
             const allIndices = new Set(Array.from({ length: emoticons.length }, (_, i) => i));

             await this.saveSelectionState(allIndices);
             this.updateSelectionUI(allIndices); // UI 즉시 업데이트
        } catch (error) {
             console.error('[selectAllEmoticons] 전체 선택 중 오류:', error);
        }
    }

    /**
     * 모든 이모티콘 선택을 해제합니다.
     */
    async deselectAllEmoticons() {
         try {
             const emptyIndices = new Set();
             await this.saveSelectionState(emptyIndices);
             this.updateSelectionUI(emptyIndices); // UI 즉시 업데이트
         } catch (error) {
             console.error('[deselectAllEmoticons] 전체 해제 중 오류:', error);
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
                await chrome.tabs.sendMessage(tabId, { action: "emoticonCacheUpdated" });
            }
        } catch (error) {
            console.error("Content script 알림 전송 실패:", error);
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
        this.settings.minRepetitions = parseInt(document.getElementById('minRepetitions').value) || CONSTANTS.DEFAULT_SETTINGS.minRepetitions;
        this.settings.maxRepetitions = parseInt(document.getElementById('maxRepetitions').value) || CONSTANTS.DEFAULT_SETTINGS.maxRepetitions;
        this.settings.minDelay = parseInt(document.getElementById('minDelay').value) || CONSTANTS.DEFAULT_SETTINGS.minDelay;
        this.settings.maxDelay = parseInt(document.getElementById('maxDelay').value) || CONSTANTS.DEFAULT_SETTINGS.maxDelay;
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

        // 단축키 설정 버튼 이벤트 리스너 다시 활성화
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