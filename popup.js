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
    }
};

// --- 상태 관리 ---
let state = {
    settings: { ...CONSTANTS.DEFAULT_SETTINGS },
    shortcuts: { ...CONSTANTS.DEFAULT_SHORTCUTS },
    emoticons: [], // 로드된 이모티콘 캐시
};

// --- DOM 요소 ---
const DOMElements = {
    minRepetitions: document.getElementById('minRepetitions'),
    maxRepetitions: document.getElementById('maxRepetitions'),
    minDelay: document.getElementById('minDelay'),
    maxDelay: document.getElementById('maxDelay'),
    shortcutDisplayManual: document.getElementById('shortcutDisplayManual'),
    shortcutDisplayAuto: document.getElementById('shortcutDisplayAuto'),
    saveButton: document.getElementById('save'),
    shortcutButton: document.getElementById('shortcutButton'),
    statusElement: document.getElementById('status'),
    emoticonListElement: document.getElementById('emoticonList'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    deselectAllBtn: document.getElementById('deselectAllBtn'),
    loadingIndicator: document.getElementById('loadingIndicator')
};

// --- 유틸리티 함수 ---

/**
 * 상태 메시지를 UI에 표시합니다.
 * @param {string} message - 표시할 메시지
 * @param {boolean} [isError=false] - 에러 메시지 여부
 */
function showStatus(message, isError = false) {
    if (!DOMElements.statusElement) return;
    DOMElements.statusElement.textContent = message;
    DOMElements.statusElement.className = isError ? 'error' : 'success';
    setTimeout(() => {
        if (DOMElements.statusElement) {
            DOMElements.statusElement.textContent = '';
            DOMElements.statusElement.className = '';
        }
    }, 3000);
}

/**
 * 로딩 인디케이터 표시 여부를 설정합니다.
 * @param {boolean} show - 표시 여부
 */
function setLoading(show) {
    if (DOMElements.loadingIndicator) {
        DOMElements.loadingIndicator.style.display = show ? 'flex' : 'none';
         }
    }

    /**
 * content script에 이모티콘 캐시 업데이트를 알립니다.
 */
async function notifyContentScriptCacheUpdate() {
        try {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
                url: "*://*.chzzk.naver.com/*"
            });

            if (tabs.length > 0) {
                const tabId = tabs[0].id;
            await chrome.tabs.sendMessage(tabId, { action: "emoticonCacheUpdated" })
                    .then(() => console.log("Content script에 캐시 업데이트 알림 전송 성공"))
                    .catch(err => {
                        if (err.message?.includes("Receiving end does not exist")) {
                            console.warn("Content script 연결 불가 (탭 로딩 중이거나 관련 없는 페이지일 수 있음)");
                        } else {
                            console.error("Content script 알림 전송 실패:", err);
                        // 사용자에게 피드백을 줄 수도 있음 (선택 사항)
                        // showStatus("콘텐츠 스크립트와 통신 실패", true);
                        }
                    });
            } else {
                console.log("알림 전송 가능한 치지직 탭 없음");
            }
        } catch (error) {
            console.error("Content script 알림 전송 중 오류:", error);
        showStatus("Content script 통신 중 오류 발생", true);
    }
}


// --- 설정 관리 ---

/**
 * 스토리지에서 설정과 단축키를 로드하여 상태에 저장하고 UI를 업데이트합니다.
 */
async function loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                CONSTANTS.STORAGE_KEYS.SETTINGS,
                CONSTANTS.STORAGE_KEYS.SHORTCUTS
            ]);
        state.settings = { ...state.settings, ...result[CONSTANTS.STORAGE_KEYS.SETTINGS] };
        state.shortcuts = { ...state.shortcuts, ...result[CONSTANTS.STORAGE_KEYS.SHORTCUTS] };
        updateSettingsUI();
        } catch (error) {
        console.error("설정 로드 중 오류 발생:", error);
        showStatus('설정 로드 중 오류가 발생했습니다.', true);
        }
    }

    /**
 * 현재 상태의 설정값을 기준으로 UI를 업데이트합니다.
 */
function updateSettingsUI() {
    if (DOMElements.minRepetitions) DOMElements.minRepetitions.value = state.settings.minRepetitions;
    if (DOMElements.maxRepetitions) DOMElements.maxRepetitions.value = state.settings.maxRepetitions;
    if (DOMElements.minDelay) DOMElements.minDelay.value = state.settings.minDelay;
    if (DOMElements.maxDelay) DOMElements.maxDelay.value = state.settings.maxDelay;
    if (DOMElements.shortcutDisplayManual) DOMElements.shortcutDisplayManual.textContent = state.shortcuts.manual;
    if (DOMElements.shortcutDisplayAuto) DOMElements.shortcutDisplayAuto.textContent = state.shortcuts.auto;
}

/**
 * UI 입력 필드에서 설정값을 읽어 상태(state.settings)를 업데이트합니다.
 */
function getSettingsFromUI() {
    const minRepetitions = parseInt(DOMElements.minRepetitions?.value) || CONSTANTS.DEFAULT_SETTINGS.minRepetitions;
    const maxRepetitions = parseInt(DOMElements.maxRepetitions?.value) || CONSTANTS.DEFAULT_SETTINGS.maxRepetitions;
    const minDelay = parseInt(DOMElements.minDelay?.value) || CONSTANTS.DEFAULT_SETTINGS.minDelay;
    const maxDelay = parseInt(DOMElements.maxDelay?.value) || CONSTANTS.DEFAULT_SETTINGS.maxDelay;

    state.settings = { minRepetitions, maxRepetitions, minDelay, maxDelay };
}

/**
 * 현재 상태(state.settings)의 설정값 유효성을 검사합니다.
     * @returns {{isValid: boolean, errorMessage: string}} 유효성 검사 결과
     */
function validateSettings() {
    const { minRepetitions, maxRepetitions, minDelay, maxDelay } = state.settings;

        if (minRepetitions < 1 || maxRepetitions < 1) 
            return { isValid: false, errorMessage: '반복 횟수는 1 이상이어야 합니다.' };
        if (minRepetitions > 100 || maxRepetitions > 100)
            return { isValid: false, errorMessage: '반복 횟수는 100 이하여야 합니다.' };
        if (minDelay < 1000 || maxDelay < 1000) 
            return { isValid: false, errorMessage: '자동 입력 간격은 1000ms 이상이어야 합니다.' };
        if (minDelay > 9999 || maxDelay > 9999)
            return { isValid: false, errorMessage: '자동 입력 간격은 9999ms 이하여야 합니다.' };
        if (minRepetitions > maxRepetitions) 
        return { isValid: false, errorMessage: '반복 횟수: 최소값이 최대값보다 클 수 없습니다.' };
        if (minDelay > maxDelay)
        return { isValid: false, errorMessage: '자동 입력 간격: 최소값이 최대값보다 클 수 없습니다.' };

        return { isValid: true, errorMessage: '' };
    }

    /**
 * 현재 상태의 설정(state.settings)과 단축키(state.shortcuts)를 스토리지에 저장합니다.
 * @returns {Promise<{success: boolean, errorMessage: string}>} 저장 결과
 */
async function saveSettings() {
    const validation = validateSettings();
            if (!validation.isValid) {
                return { success: false, errorMessage: validation.errorMessage };
            }

    try {
            await chrome.storage.sync.set({
            [CONSTANTS.STORAGE_KEYS.SETTINGS]: state.settings,
            [CONSTANTS.STORAGE_KEYS.SHORTCUTS]: state.shortcuts // 단축키는 UI에서 수정하지 않지만, 함께 저장
            });
        console.log("설정 저장 완료:", state.settings);
            return { success: true, errorMessage: '' };
        } catch (error) {
        console.error("설정 저장 중 오류 발생:", error);
        let errorMessage = '설정 저장 중 알 수 없는 오류가 발생했습니다.';
            if (error.message.includes('QuotaExceededError')) {
            errorMessage = 'Chrome 동기화 저장 공간이 부족합니다. 다른 기기의 설정을 확인하거나 일부 데이터를 삭제해주세요.';
            } else if (error.message.includes('NetworkError')) {
            errorMessage = '네트워크 연결 문제로 설정을 저장할 수 없습니다. 연결 상태를 확인해주세요.';
            }
            return { success: false, errorMessage };
        }
    }


// --- 이모티콘 관리 ---

/**
 * 스토리지에서 이모티콘 캐시를 로드하여 상태(state.emoticons)에 저장하고 UI를 갱신합니다.
 */
async function loadEmoticonList() {
    setLoading(true);
    DOMElements.emoticonListElement.innerHTML = ''; // 목록 비우기
    try {
        const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
        state.emoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
        console.log(`로드된 이모티콘 ${state.emoticons.length}개`);
        renderEmoticonList(); // 상태 기반으로 UI 렌더링
    } catch (error) {
        console.error("이모티콘 목록 로드 실패:", error);
        showStatus("이모티콘 목록 로드 중 오류 발생", true);
        state.emoticons = []; // 오류 발생 시 빈 배열로 초기화
        renderEmoticonList(); // 빈 목록이라도 렌더링 시도 (선택 사항)
    } finally {
        setLoading(false);
    }
}

/**
 * 현재 상태(state.emoticons)를 기반으로 이모티콘 목록 UI를 생성/갱신합니다.
 */
function renderEmoticonList() {
    if (!DOMElements.emoticonListElement) return;

    DOMElements.emoticonListElement.innerHTML = ''; // 기존 목록 제거
    let selectedCount = 0;

    if (state.emoticons.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.textContent = "추가된 이모티콘이 없습니다.";
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = 'var(--text-secondary)';
        emptyMessage.style.gridColumn = 'span 5'; // 그리드 전체 너비 사용
        DOMElements.emoticonListElement.appendChild(emptyMessage);
    } else {
        state.emoticons.forEach((emoticon) => {
            const item = createEmoticonItemElement(emoticon);
            DOMElements.emoticonListElement.appendChild(item);
            if (emoticon.selected) {
                selectedCount++;
            }
        });
    }


    console.log(`이모티콘 목록 UI 렌더링 완료, 선택됨: ${selectedCount}개`);
    updateSelectionButtonStates(selectedCount, state.emoticons.length);
}

/**
 * 개별 이모티콘 아이템 DOM 요소를 생성합니다.
 * @param {object} emoticon - 이모티콘 데이터 ({ name, url, selected })
 * @returns {HTMLElement} 생성된 div 요소
 */
function createEmoticonItemElement(emoticon) {
    const item = document.createElement('div');
    item.className = 'emoticon-item';
    item.dataset.name = emoticon.name; // 데이터 속성으로 이름 저장

    const img = document.createElement('img');
    img.src = emoticon.url;
    img.alt = emoticon.name;
    img.title = emoticon.name;
    img.loading = 'lazy'; // 이미지 지연 로딩

    const removeBtn = document.createElement('span');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = '이모티콘 제거';
    removeBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // 이벤트 버블링 방지
        handleRemoveEmoticon(emoticon.name);
    });

    item.appendChild(img);
    item.appendChild(removeBtn);
    item.addEventListener('click', () => handleToggleEmoticonSelection(emoticon.name));

    if (emoticon.selected) {
        item.classList.add('selected');
    }

    return item;
}


/**
 * 전체 선택/해제 버튼의 활성화/비활성화 상태를 업데이트합니다.
 * @param {number} selectedCount - 현재 선택된 이모티콘 수
 * @param {number} totalCount - 전체 이모티콘 수
 */
function updateSelectionButtonStates(selectedCount, totalCount) {
    if (DOMElements.selectAllBtn) {
        DOMElements.selectAllBtn.disabled = totalCount === 0 || selectedCount === totalCount;
    }
    if (DOMElements.deselectAllBtn) {
        DOMElements.deselectAllBtn.disabled = totalCount === 0 || selectedCount === 0;
    }
}

/**
 * 이모티콘 선택 상태 토글을 처리하고 UI 및 스토리지를 업데이트합니다.
 * @param {string} nameToToggle - 토글할 이모티콘의 이름
 */
async function handleToggleEmoticonSelection(nameToToggle) {
    const emoticonIndex = state.emoticons.findIndex(e => e.name === nameToToggle);
    if (emoticonIndex === -1) {
        console.warn(`이름 "${nameToToggle}"에 해당하는 이모티콘을 찾을 수 없습니다.`);
        showStatus("이모티콘 상태 변경 실패: 대상을 찾을 수 없음", true);
        return;
    }

    // 상태 업데이트
    const emoticon = state.emoticons[emoticonIndex];
    emoticon.selected = !emoticon.selected;
    console.log(`이모티콘 "${nameToToggle}" 선택 상태 변경: ${emoticon.selected}`);

    // UI 업데이트 (해당 아이템만)
    const itemElement = DOMElements.emoticonListElement.querySelector(`[data-name="${CSS.escape(nameToToggle)}"]`);
    if (itemElement) {
        itemElement.classList.toggle('selected', emoticon.selected);
    }

    // 선택/해제 버튼 상태 업데이트
    const selectedCount = state.emoticons.filter(e => e.selected).length;
    updateSelectionButtonStates(selectedCount, state.emoticons.length);

    // 스토리지 업데이트
    try {
        await chrome.storage.local.set({ [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: state.emoticons });
        const status = emoticon.selected ? "선택됨" : "선택 해제됨";
        showStatus(`이모티콘 ${status}`, false);
        notifyContentScriptCacheUpdate();
    } catch (error) {
        console.error('이모티콘 선택 상태 저장 중 오류:', error);
        showStatus("이모티콘 선택 상태 저장 실패", true);
        // 상태 롤백 (선택 사항)
        emoticon.selected = !emoticon.selected;
        if (itemElement) itemElement.classList.toggle('selected', emoticon.selected);
        updateSelectionButtonStates(state.emoticons.filter(e => e.selected).length, state.emoticons.length);
    }
}

/**
 * 이모티콘 제거를 처리하고 UI 및 스토리지를 업데이트합니다.
 * @param {string} nameToRemove - 제거할 이모티콘의 이름
 */
async function handleRemoveEmoticon(nameToRemove) {
    const initialEmoticons = [...state.emoticons]; // 롤백을 위한 복사본
    const indexToRemove = state.emoticons.findIndex(e => e.name === nameToRemove);

    if (indexToRemove === -1) {
        console.warn(`제거할 이모티콘 이름 "${nameToRemove}" 찾기 실패`);
        showStatus("이모티콘 제거 실패: 대상을 찾을 수 없음", true);
        return;
    }

    // 상태 업데이트 (먼저 제거)
    const removedEmoticon = state.emoticons.splice(indexToRemove, 1)[0];
    console.log(`이모티콘 "${nameToRemove}" 상태에서 제거됨`);

    // UI 업데이트 (전체 목록 다시 렌더링)
    renderEmoticonList();

    // 스토리지 업데이트
    try {
        await chrome.storage.local.set({ [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: state.emoticons });
        showStatus(`이모티콘 "${removedEmoticon.name}" 제거됨`, false);
        notifyContentScriptCacheUpdate();
    } catch (error) {
        console.error("이모티콘 제거 중 오류:", error);
        showStatus("이모티콘 제거 중 오류 발생", true);
        // 상태 롤백
        state.emoticons = initialEmoticons;
        renderEmoticonList();
    }
}

/**
 * 모든 이모티콘 선택 처리를 하고 UI 및 스토리지를 업데이트합니다.
 */
async function handleSelectAllEmoticons() {
    if (state.emoticons.length === 0) return;

    const initialEmoticons = JSON.parse(JSON.stringify(state.emoticons)); // 깊은 복사로 롤백 준비
    let changed = false;
    state.emoticons.forEach(e => {
        if (!e.selected) {
            e.selected = true;
            changed = true;
        }
    });

    if (!changed) {
        showStatus("이미 모든 이모티콘이 선택되어 있습니다.", false);
        return;
    }

    // UI 업데이트
    renderEmoticonList(); // 전체 목록 다시 렌더링

    // 스토리지 업데이트
    try {
        await chrome.storage.local.set({ [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: state.emoticons });
        showStatus("모든 이모티콘 선택됨", false);
        notifyContentScriptCacheUpdate();
    } catch (error) {
        console.error('[handleSelectAllEmoticons] 전체 선택 저장 중 오류:', error);
        showStatus("전체 선택 저장 중 오류 발생", true);
        // 상태 롤백
        state.emoticons = initialEmoticons;
        renderEmoticonList();
    }
}

/**
 * 모든 이모티콘 선택 해제 처리를 하고 UI 및 스토리지를 업데이트합니다.
 */
async function handleDeselectAllEmoticons() {
    if (state.emoticons.length === 0) return;

    const initialEmoticons = JSON.parse(JSON.stringify(state.emoticons)); // 깊은 복사로 롤백 준비
    let changed = false;
    state.emoticons.forEach(e => {
        if (e.selected) {
            e.selected = false;
            changed = true;
        }
    });

    if (!changed) {
        showStatus("선택된 이모티콘이 없습니다.", false);
        return;
    }

    // UI 업데이트
    renderEmoticonList();

    // 스토리지 업데이트
    try {
        await chrome.storage.local.set({ [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: state.emoticons });
        showStatus("모든 이모티콘 선택 해제됨", false);
        notifyContentScriptCacheUpdate();
    } catch (error) {
        console.error('[handleDeselectAllEmoticons] 전체 해제 저장 중 오류:', error);
        showStatus("전체 해제 저장 중 오류 발생", true);
        // 상태 롤백
        state.emoticons = initialEmoticons;
        renderEmoticonList();
    }
}


// --- 이벤트 리스너 설정 ---

/**
 * 필요한 모든 이벤트 리스너를 등록합니다.
 */
function initializeEventListeners() {
    DOMElements.saveButton?.addEventListener('click', async () => {
        getSettingsFromUI(); // UI에서 최신 설정값 읽기
        const result = await saveSettings(); // 설정 저장 시도
            
            if (result.success) {
            showStatus('설정이 저장되었습니다.', false);
            } else {
            showStatus(`설정 저장 실패: ${result.errorMessage}`, true);
            }
        });

    DOMElements.shortcutButton?.addEventListener('click', () => {
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        });

    DOMElements.selectAllBtn?.addEventListener('click', handleSelectAllEmoticons);
    DOMElements.deselectAllBtn?.addEventListener('click', handleDeselectAllEmoticons);

    // 입력 필드 변경 시 즉시 상태 업데이트 (선택 사항, 저장 버튼 누를 때만 업데이트해도 됨)
    // DOMElements.minRepetitions?.addEventListener('input', getSettingsFromUI);
    // DOMElements.maxRepetitions?.addEventListener('input', getSettingsFromUI);
    // DOMElements.minDelay?.addEventListener('input', getSettingsFromUI);
    // DOMElements.maxDelay?.addEventListener('input', getSettingsFromUI);
}


// --- 초기화 ---
async function initializePopup() {
    console.log("팝업 초기화 시작");
    initializeEventListeners(); // 이벤트 리스너 먼저 등록
    await loadSettings();     // 설정 로드 및 UI 업데이트
    await loadEmoticonList(); // 이모티콘 목록 로드 및 UI 업데이트
    console.log("팝업 초기화 완료");
}

// DOM 로드 완료 후 초기화 함수 실행
document.addEventListener('DOMContentLoaded', initializePopup);